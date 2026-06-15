import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Request, Response } from 'express';

import {
  AccessTokenVerificationError,
  AuthCookieService,
  AuthIdentityService,
  TokenVerifierService,
} from '../services';
import { UsersService } from 'src/modules/users/users.service';
import { AccessTokenPayload } from '../interfaces';
import { IS_PUBLIC_KEY } from '../decorators';
import { User } from 'src/modules/users/entities';

interface AccessTokenAttemptResult {
  user: User | null;
  failure: AccessTokenVerificationError | null;
}

@Injectable()
export class OAuthGuard implements CanActivate {
  private readonly logger = new Logger(OAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly identityService: AuthIdentityService,
    private readonly usersService: UsersService,
    private readonly authCookieService: AuthCookieService,
    private readonly tokenVerifierService: TokenVerifierService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const user = await this.authenticate(request, response);

    request['user'] = user;

    return true;
  }

  private async authenticate(request: Request, response: Response) {
    const accessToken = this.authCookieService.getAccessToken(request);
    const refreshToken = this.authCookieService.getRefreshToken(request);
    let accessTokenFailure: AccessTokenVerificationError | null = null;

    if (accessToken) {
      const result = await this.tryAccessToken(accessToken);

      if (result.user) {
        return result.user;
      }

      accessTokenFailure = result.failure;

      if (accessTokenFailure && !accessTokenFailure.canAttemptRefresh) {
        this.logger.warn(`Rejecting request due to access token failure: ${accessTokenFailure.reason}`);
        this.authCookieService.clearAuthCookies(response);
        throw new UnauthorizedException('Session is no longer valid. Please login again.');
      }
    }

    if (refreshToken) {
      if (accessTokenFailure?.canAttemptRefresh) {
        this.logger.debug(`Attempting refresh after access token failure: ${accessTokenFailure.reason}`);
      }

      return this.tryRefreshToken(refreshToken, response);
    }

    if (accessTokenFailure) {
      this.authCookieService.clearAuthCookies(response);
      throw new UnauthorizedException('Session expired. Please login again.');
    }

    throw new UnauthorizedException('Authentication required. Please login.');
  }

  private async tryAccessToken(accessToken: string): Promise<AccessTokenAttemptResult> {
    let payload: AccessTokenPayload;

    try {
      payload = await this.tokenVerifierService.verifyAccessToken(accessToken);
    } catch (error) {
      if (error instanceof AccessTokenVerificationError) {
        return { user: null, failure: error };
      }

      throw error;
    }

    const user = await this.usersService.findByExternalKey(payload.externalKey);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return { user, failure: null };
  }

  private async tryRefreshToken(refreshToken: string, response: Response) {
    try {
      const tokens = await this.identityService.refreshTokens(refreshToken);
      const payload = await this.tokenVerifierService.verifyAccessToken(tokens.accessToken);
      const user = await this.usersService.findByExternalKey(payload.externalKey);

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Identity Hub refresh tokens rotate; always replace both local cookies with the new pair.
      this.authCookieService.setAuthCookies(response, tokens);

      return user;
    } catch {
      this.authCookieService.clearAuthCookies(response);
      throw new UnauthorizedException('Token expired or invalid. Please login again.');
    }
  }
}
