import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import jwt, { type JwtPayload } from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';

import { AccessTokenPayload } from '../interfaces/identity-hub-token.interface';
import { EnvironmentVariables } from 'src/config';

export enum AccessTokenFailureReason {
  EXPIRED = 'expired',
  INVALID_HEADER = 'invalid_header',
  INVALID_TOKEN = 'invalid_token',
  NOT_ACTIVE = 'not_active',
  VERIFICATION_FAILED = 'verification_failed',
}

export class AccessTokenVerificationError extends UnauthorizedException {
  constructor(
    public readonly reason: AccessTokenFailureReason,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class TokenVerifierService {
  private readonly jwksClient: JwksClient;

  constructor(private readonly configService: ConfigService<EnvironmentVariables, true>) {
    const identityHubUrl = this.configService.getOrThrow('IDENTITY_HUB_PUBLIC_URL', { infer: true });
    const jwksUri = new URL('.well-known/jwks.json', this.ensureTrailingSlash(identityHubUrl)).toString();

    this.jwksClient = new JwksClient({
      jwksUri,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 10 * 60 * 1000,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
    });
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      const decoded = jwt.decode(token, { complete: true });

      if (
        decoded?.header?.alg !== 'RS256' ||
        typeof decoded.header.kid !== 'string' ||
        decoded.header.kid.length === 0
      ) {
        throw new AccessTokenVerificationError(AccessTokenFailureReason.INVALID_HEADER, 'Invalid access token header');
      }

      const key = await this.jwksClient.getSigningKey(decoded.header.kid);
      const audience = this.configService.getOrThrow('OAUTH_CLIENT_ID', { infer: true });
      const issuer = this.configService.getOrThrow('IDENTITY_HUB_PUBLIC_URL', { infer: true });

      const verifiedPayload = jwt.verify(token, key.getPublicKey(), {
        algorithms: ['RS256'],
        issuer,
        audience,
      });

      return this.validateIdentityClaims(verifiedPayload);
    } catch (error) {
      if (error instanceof AccessTokenVerificationError) {
        throw error;
      }

      if (error instanceof jwt.TokenExpiredError) {
        throw new AccessTokenVerificationError(AccessTokenFailureReason.EXPIRED, 'Access token expired');
      }

      if (error instanceof jwt.NotBeforeError) {
        throw new AccessTokenVerificationError(AccessTokenFailureReason.NOT_ACTIVE, 'Access token is not active');
      }

      if (error instanceof jwt.JsonWebTokenError) {
        throw new AccessTokenVerificationError(AccessTokenFailureReason.INVALID_TOKEN, 'Invalid access token');
      }

      throw new AccessTokenVerificationError(
        AccessTokenFailureReason.VERIFICATION_FAILED,
        'Access token verification failed',
      );
    }
  }

  private validateIdentityClaims(payload: string | JwtPayload): AccessTokenPayload {
    if (
      typeof payload === 'string' ||
      typeof payload.sub !== 'string' ||
      payload.sub.trim().length === 0 ||
      typeof payload.externalKey !== 'string' ||
      payload.externalKey.trim().length === 0 ||
      typeof payload.name !== 'string' ||
      payload.name.trim().length === 0 ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number' ||
      !Number.isFinite(payload.exp)
    ) {
      throw new AccessTokenVerificationError(
        AccessTokenFailureReason.INVALID_TOKEN,
        'Access token is missing required identity claims',
      );
    }

    return {
      ...payload,
      sub: payload.sub.trim(),
      externalKey: payload.externalKey.trim(),
      name: payload.name.trim(),
    } as AccessTokenPayload;
  }

  private ensureTrailingSlash(value: string): string {
    return value.endsWith('/') ? value : `${value}/`;
  }
}
