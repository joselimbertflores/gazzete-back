import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import jwt, { type JwtPayload } from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';

import { AccessTokenPayload, LogoutTokenPayload } from '../interfaces/identity-hub-token.interface';
import { EnvironmentVariables } from 'src/config';

const BACKCHANNEL_LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';

class InvalidJwtHeaderError extends Error {}

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
    const identityHubUrl =
      this.configService.get('IDENTITY_HUB_INTERNAL_URL', { infer: true }) ??
      this.configService.getOrThrow('IDENTITY_HUB_PUBLIC_URL', { infer: true });
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
      const verifiedPayload = await this.verifyIdentityHubJwt(token);
      return this.validateIdentityClaims(verifiedPayload);
    } catch (error) {
      if (error instanceof AccessTokenVerificationError) {
        throw error;
      }

      if (error instanceof InvalidJwtHeaderError) {
        throw new AccessTokenVerificationError(AccessTokenFailureReason.INVALID_HEADER, 'Invalid access token header');
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

  async verifyLogoutToken(token: string): Promise<LogoutTokenPayload> {
    try {
      const verifiedPayload = await this.verifyIdentityHubJwt(token, 'logout+jwt');
      return this.validateLogoutClaims(verifiedPayload);
    } catch {
      throw new UnauthorizedException('Invalid logout token');
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
      typeof payload.sid !== 'string' ||
      payload.sid.trim().length === 0 ||
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
      sid: payload.sid.trim(),
    } as AccessTokenPayload;
  }

  private validateLogoutClaims(payload: string | JwtPayload): LogoutTokenPayload {
    const audience = this.configService.getOrThrow('OAUTH_CLIENT_ID', { infer: true });
    const events: unknown = typeof payload === 'string' ? undefined : payload.events;

    if (
      typeof payload === 'string' ||
      payload.aud !== audience ||
      typeof payload.exp !== 'number' ||
      !Number.isFinite(payload.exp) ||
      typeof payload.iat !== 'number' ||
      !Number.isFinite(payload.iat) ||
      typeof payload.jti !== 'string' ||
      payload.jti.trim().length === 0 ||
      typeof payload.sid !== 'string' ||
      payload.sid.trim().length === 0 ||
      typeof events !== 'object' ||
      events === null ||
      Array.isArray(events) ||
      !Object.prototype.hasOwnProperty.call(events, BACKCHANNEL_LOGOUT_EVENT) ||
      Object.prototype.hasOwnProperty.call(payload, 'nonce')
    ) {
      throw new UnauthorizedException('Invalid logout token claims');
    }

    return {
      ...payload,
      jti: payload.jti.trim(),
      sid: payload.sid.trim(),
      events: events as Record<string, unknown>,
    } as LogoutTokenPayload;
  }

  private async verifyIdentityHubJwt(token: string, requiredType?: string): Promise<string | JwtPayload> {
    const decoded = jwt.decode(token, { complete: true });

    if (
      decoded?.header?.alg !== 'RS256' ||
      typeof decoded.header.kid !== 'string' ||
      decoded.header.kid.length === 0 ||
      (requiredType !== undefined && decoded.header.typ !== requiredType)
    ) {
      throw new InvalidJwtHeaderError();
    }

    const key = await this.jwksClient.getSigningKey(decoded.header.kid);
    const issuer = this.configService.getOrThrow('IDENTITY_HUB_PUBLIC_URL', { infer: true });
    const audience = this.configService.getOrThrow('OAUTH_CLIENT_ID', { infer: true });

    return jwt.verify(token, key.getPublicKey(), {
      algorithms: ['RS256'],
      issuer,
      audience,
    });
  }

  private ensureTrailingSlash(value: string): string {
    return value.endsWith('/') ? value : `${value}/`;
  }
}
