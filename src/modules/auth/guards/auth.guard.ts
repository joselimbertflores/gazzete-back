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

import type { Request, Response } from 'express';

import type { AuthSession } from '../entities';
import type { AccessTokenPayload } from '../interfaces';
import {
  AccessTokenFailureReason,
  AccessTokenVerificationError,
  AuthCookieService,
  AuthSessionService,
  IdentityHubTokenProtocolError,
  IdentityHubTokenRequestError,
  IdentityHubUnavailableError,
  SessionReauthorizationRequiredError,
  TokenVerifierService,
} from '../services';
import { IS_PUBLIC_KEY } from '../decorators';
import type { User } from 'src/modules/users/entities';

@Injectable()
export class OAuthGuard implements CanActivate {
  private readonly logger = new Logger(OAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly authSessionService: AuthSessionService,
    private readonly authCookieService: AuthCookieService,
    private readonly tokenVerifierService: TokenVerifierService,
  ) {}

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
    const sessionId = this.authCookieService.getSessionId(request);

    if (!sessionId) {
      throw new UnauthorizedException('Authentication required. Please login.');
    }

    let session = await this.authSessionService.findActiveSession(sessionId);

    if (!session) {
      this.authCookieService.clearSessionCookie(response);
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
      this.authCookieService.setSessionCookie(response, session.id, session.refreshTokenExpiresAt);
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
        this.authCookieService.clearSessionCookie(response);
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
    this.authCookieService.clearSessionCookie(response);
    throw new UnauthorizedException('Session is no longer valid. Please login again.');
  }

  private async assertTokenMatchesSession(
    payload: AccessTokenPayload,
    session: AuthSession,
    response: Response,
  ): Promise<void> {
    if (payload.externalKey === session.user.externalKey) return;

    await this.authSessionService.deleteSession(session.id);
    this.authCookieService.clearSessionCookie(response);
    throw new UnauthorizedException('Session identity is no longer valid. Please login again.');
  }
}
