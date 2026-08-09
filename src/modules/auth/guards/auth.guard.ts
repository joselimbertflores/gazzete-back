import {
  BadGatewayException,
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import type { Request, Response } from 'express';

import type { AuthSession } from '../entities/auth-session.entity';
import type { AccessTokenPayload } from '../interfaces/identity-hub-token.interface';
import { getAuthCookieOptions, SESSION_COOKIE_NAME, usesSecureAuthCookies } from '../auth-cookies';
import {
  AccessTokenFailureReason,
  AccessTokenVerificationError,
  TokenVerifierService,
} from '../services/token-verifier.service';
import { AuthSessionService, SessionReauthorizationRequiredError } from '../services/auth-session.service';
import {
  IdentityHubTokenProtocolError,
  IdentityHubTokenRequestError,
  IdentityHubUnavailableError,
} from '../services/auth-identity.service';
import { IS_PUBLIC_KEY } from '../decorators';
import { EnvironmentVariables } from 'src/config';
import type { User } from 'src/modules/users/entities';

@Injectable()
export class OAuthGuard implements CanActivate {
  private readonly logger = new Logger(OAuthGuard.name);
  private readonly secureCookies: boolean;

  constructor(
    private readonly reflector: Reflector,
    private readonly authSessionService: AuthSessionService,
    private readonly tokenVerifierService: TokenVerifierService,
    configService: ConfigService<EnvironmentVariables, true>,
  ) {
    this.secureCookies = usesSecureAuthCookies(configService.getOrThrow('GAZETTE_PUBLIC_URL', { infer: true }));
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    request['user'] = await this.authenticate(request, response);
    return true;
  }

  private async authenticate(request: Request, response: Response): Promise<User> {
    const sessionId = request.cookies?.[SESSION_COOKIE_NAME] as string | undefined;

    if (!sessionId) {
      throw new UnauthorizedException('Authentication required. Please login.');
    }

    let session = await this.authSessionService.findActiveSession(sessionId);

    if (!session) {
      this.clearSessionCookie(response);
      throw new UnauthorizedException('Session expired. Please login again.');
    }

    let payload: AccessTokenPayload;

    try {
      payload = await this.tokenVerifierService.verifyAccessToken(session.accessToken);
    } catch (error: unknown) {
      if (!(error instanceof AccessTokenVerificationError)) throw error;

      if (error.reason !== AccessTokenFailureReason.EXPIRED) {
        await this.handleStoredAccessTokenFailure(error, sessionId, response);
      }

      session = await this.refreshSession(sessionId, session.accessToken, response);
      payload = await this.verifyRefreshedAccessToken(session.accessToken);
      response.cookie(SESSION_COOKIE_NAME, session.id, {
        ...getAuthCookieOptions(this.secureCookies),
        expires: session.refreshTokenExpiresAt,
      });
    }

    await this.assertTokenMatchesSession(payload, session, response);

    return session.user;
  }

  private async refreshSession(
    sessionId: string,
    expiredAccessToken: string,
    response: Response,
  ): Promise<AuthSession> {
    try {
      return await this.authSessionService.refreshSession(sessionId, expiredAccessToken);
    } catch (error: unknown) {
      if (error instanceof SessionReauthorizationRequiredError) {
        this.clearSessionCookie(response);
        throw new UnauthorizedException('Session expired. Please login again.');
      }

      if (error instanceof IdentityHubUnavailableError) {
        throw new ServiceUnavailableException({
          code: 'identity_hub_unavailable',
          message: 'Identity Hub is temporarily unavailable. Please retry.',
        });
      }

      if (error instanceof IdentityHubTokenRequestError || error instanceof IdentityHubTokenProtocolError) {
        throw new BadGatewayException({
          code: 'identity_hub_token_error',
          message: 'Identity Hub could not refresh the local session.',
        });
      }

      throw error;
    }
  }

  private async verifyRefreshedAccessToken(accessToken: string): Promise<AccessTokenPayload> {
    try {
      return await this.tokenVerifierService.verifyAccessToken(accessToken);
    } catch (error: unknown) {
      if (
        error instanceof AccessTokenVerificationError &&
        error.reason === AccessTokenFailureReason.VERIFICATION_FAILED
      ) {
        throw new ServiceUnavailableException({
          code: 'identity_hub_unavailable',
          message: 'Identity Hub token verification is temporarily unavailable. Please retry.',
        });
      }

      if (error instanceof AccessTokenVerificationError) {
        throw new BadGatewayException({
          code: 'identity_hub_invalid_token',
          message: 'Identity Hub returned an invalid access token.',
        });
      }

      throw error;
    }
  }

  private async handleStoredAccessTokenFailure(
    error: AccessTokenVerificationError,
    sessionId: string,
    response: Response,
  ): Promise<never> {
    if (error.reason === AccessTokenFailureReason.VERIFICATION_FAILED) {
      throw new ServiceUnavailableException({
        code: 'identity_hub_unavailable',
        message: 'Identity Hub token verification is temporarily unavailable. Please retry.',
      });
    }

    this.logger.warn(`Deleting local session due to access token failure: ${error.reason}`);
    await this.authSessionService.deleteSession(sessionId);
    this.clearSessionCookie(response);
    throw new UnauthorizedException('Session is no longer valid. Please login again.');
  }

  private async assertTokenMatchesSession(
    payload: AccessTokenPayload,
    session: AuthSession,
    response: Response,
  ): Promise<void> {
    if (payload.externalKey === session.user.externalKey) return;

    await this.authSessionService.deleteSession(session.id);
    this.clearSessionCookie(response);
    throw new UnauthorizedException('Session identity is no longer valid. Please login again.');
  }

  private clearSessionCookie(response: Response): void {
    response.clearCookie(SESSION_COOKIE_NAME, getAuthCookieOptions(this.secureCookies));
  }
}
