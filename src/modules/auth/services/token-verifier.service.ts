import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import jwt, { type JwtPayload } from 'jsonwebtoken';

import { JwksService } from './jwks.service';
import { AccessTokenPayload } from '../interfaces';
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
  constructor(
    private readonly jwksService: JwksService,
    private readonly configService: ConfigService<EnvironmentVariables>,
  ) {}

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

      const publicKey = await this.jwksService.getPublicKey(decoded.header.kid);
      const audience = this.configService.getOrThrow<string>('OAUTH_CLIENT_ID');
      const issuer = this.configService.getOrThrow<string>('OAUTH_ISSUER');

      const verifiedPayload = jwt.verify(token, publicKey, {
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
    const expectedIssuer = this.configService.getOrThrow<string>('OAUTH_ISSUER');
    const expectedAudience = this.configService.getOrThrow<string>('OAUTH_CLIENT_ID');
    const hasExpectedAudience =
      typeof payload !== 'string' &&
      (payload.aud === expectedAudience || (Array.isArray(payload.aud) && payload.aud.includes(expectedAudience)));

    if (
      typeof payload === 'string' ||
      typeof payload.sub !== 'string' ||
      payload.sub.trim().length === 0 ||
      typeof payload.externalKey !== 'string' ||
      payload.externalKey.trim().length === 0 ||
      typeof payload.name !== 'string' ||
      payload.name.trim().length === 0 ||
      payload.iss !== expectedIssuer ||
      !hasExpectedAudience ||
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
}
