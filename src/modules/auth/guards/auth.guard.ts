import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Request, Response } from 'express';

import { AuthCookieService, AuthIdentityService, TokenVerifierService } from '../services';
import { IS_PUBLIC_KEY } from '../decorators';
import { AccessTokenPayload } from '../interfaces';

@Injectable()
export class OAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly identityService: AuthIdentityService,
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

    const accessToken = this.authCookieService.getAccessToken(request);
    const refreshToken = this.authCookieService.getRefreshToken(request);

    const user = await this.authenticate(accessToken, refreshToken, response);

    request['user'] = user;

    return true;
  }

  private async authenticate(accessToken: string | undefined, refreshToken: string | undefined, response: Response) {
    if (accessToken) {
      const user = await this.tryAccess(accessToken);
      if (user) return user;
    }

    if (refreshToken) {
      return this.tryRefresh(refreshToken, response);
    }

    throw new UnauthorizedException('Authentication required. Please login.');
  }

  private async tryAccess(accessToken: string) {
    let payload: AccessTokenPayload;

    try {
      payload = await this.tokenVerifierService.verifyAccessToken(accessToken);
    } catch {
      return null;
    }

    const user = await this.identityService.loadUser(payload.externalKey);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  private async tryRefresh(refreshToken: string, response: Response) {
    try {
      const tokens = await this.identityService.refreshTokens(refreshToken);

      this.authCookieService.setAuthCookies(response, tokens);

      const payload = await this.tokenVerifierService.verifyAccessToken(tokens.accessToken);

      const user = await this.identityService.loadUser(payload.externalKey);

      if (!user) {
        this.authCookieService.clearAuthCookies(response);
        throw new UnauthorizedException('User not found');
      }

      return user;
      
    } catch {
      this.authCookieService.clearAuthCookies(response);
      throw new UnauthorizedException('Token expired or invalid. Please login again.');
    }
  }
}
