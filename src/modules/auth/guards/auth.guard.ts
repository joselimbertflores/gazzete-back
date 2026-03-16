import { Injectable, CanActivate, HttpException, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Request, Response } from 'express';

import { AccessTokenPayload, TokenRequestResponse } from '../interfaces';
import { IdentityService, TokenVerifierService } from '../services';
import { IS_PUBLIC_KEY } from '../decorators';

@Injectable()
export class OAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private identityService: IdentityService,
    private tokenVerifierService: TokenVerifierService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const accessToken = request.cookies['gazette_access'] as string | undefined;
    const refreshToken = request.cookies['gazette_refresh'] as string | undefined;

    const user = await this.authenticate(accessToken, refreshToken, response);
    request['user'] = user;
    return true;
  }

  private async authenticate(accessToken: string | undefined, refreshToken: string | undefined, res: Response) {
    if (accessToken) {
      const user = await this.tryAccess(accessToken);
      if (user) return user;
    }
    if (refreshToken) {
      const user = await this.tryRefresh(refreshToken, res);
      return user;
    }
    throw new UnauthorizedException('Authentication required. Please login.');
  }

  private async tryAccess(accessToken: string) {
    try {
      const payload: AccessTokenPayload = await this.tokenVerifierService.verifyAccessToken(accessToken);
      return this.identityService.loadUser(payload.externalKey);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      return null;
    }
  }

  private async tryRefresh(refreshToken: string, response: Response) {
    try {
      const result = await this.identityService.refreshTokens(refreshToken);
      this.setCookies(response, result);
      const payload: AccessTokenPayload = await this.tokenVerifierService.verifyAccessToken(result.accessToken);
      return await this.identityService.loadUser(payload.externalKey);
    } catch (error: unknown) {
      this.clearCookies(response);
      throw new UnauthorizedException('Token expired or invalid. Please login again.');
    }
  }

  private setCookies(res: Response, result: TokenRequestResponse) {
    res.cookie('intranet_access', result.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: result.accessTokenExpiresIn * 1000,
    });

    res.cookie('intranet_refresh', result.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: result.refreshTokenExpiresIn * 1000,
    });
  }

  private clearCookies(res: Response) {
    res.clearCookie('intranet_access');
    res.clearCookie('intranet_refresh');
  }
}
