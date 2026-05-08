import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Request, Response } from 'express';

import { AuthCookieService, AuthIdentityService, TokenVerifierService } from '../services';
import { IS_PUBLIC_KEY } from '../decorators';
import { AccessTokenPayload } from '../interfaces';
import { UsersService } from 'src/modules/users/users.service';

@Injectable()
export class OAuthGuard implements CanActivate {
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

    if (accessToken) {
      const user = await this.tryAccessToken(accessToken);
      if (user) return user;
    }

    if (refreshToken) {
      return this.tryRefreshToken(refreshToken, response);
    }

    throw new UnauthorizedException('Authentication required. Please login.');
  }

  private async tryAccessToken(accessToken: string) {
    let payload: AccessTokenPayload;

    try {
      payload = await this.tokenVerifierService.verifyAccessToken(accessToken);
    } catch {
      return null;
    }

    const user = await this.usersService.findByExternalKey(payload.externalKey);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  private async tryRefreshToken(refreshToken: string, response: Response) {
    try {
      const tokens = await this.identityService.refreshTokens(refreshToken);
      const payload = await this.tokenVerifierService.verifyAccessToken(tokens.accessToken);
      const user = await this.usersService.findByExternalKey(payload.externalKey);

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      this.authCookieService.setAuthCookies(response, tokens);

      return user;
    } catch {
      this.authCookieService.clearAuthCookies(response);
      throw new UnauthorizedException('Token expired or invalid. Please login again.');
    }
  }
}
