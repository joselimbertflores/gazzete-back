import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { CookieOptions, Request, Response } from 'express';

import { EnvironmentVariables } from 'src/config';
import { TokenRequestResponse } from '../interfaces';

@Injectable()
export class AuthCookieService {
  private readonly accessCookieName = 'gazette_access';
  private readonly refreshCookieName = 'gazette_refresh';
  private readonly stateCookieName = 'gazette_oauth_state';

  constructor(private readonly configService: ConfigService<EnvironmentVariables>) {}

  setOAuthStateCookie(response: Response, state: string) {
    response.cookie(this.stateCookieName, state, {
      ...this.getBaseOptions(),
      maxAge: 5 * 60 * 1000,
    });
  }

  clearOAuthStateCookie(response: Response) {
    response.clearCookie(this.stateCookieName, this.getBaseOptions());
  }

  setAuthCookies(response: Response, tokens: TokenRequestResponse) {
    response.cookie(this.accessCookieName, tokens.accessToken, {
      ...this.getBaseOptions(),
      maxAge: tokens.accessTokenExpiresIn * 1000,
    });

    response.cookie(this.refreshCookieName, tokens.refreshToken, {
      ...this.getBaseOptions(),
      maxAge: tokens.refreshTokenExpiresIn * 1000,
    });
  }

  clearAuthCookies(response: Response) {
    response.clearCookie(this.accessCookieName, this.getBaseOptions());
    response.clearCookie(this.refreshCookieName, this.getBaseOptions());
  }

  getAccessToken(request: Request): string | undefined {
    return request.cookies['gazette_access'] as string | undefined;
  }

  getRefreshToken(request: Request): string | undefined {
    return request.cookies['gazette_refresh'] as string | undefined;
  }

  private getBaseOptions(): CookieOptions {
    const secure = this.configService.getOrThrow<boolean>('IDENTITY_COOKIE_SECURE');
    // TODO revisar si el valor es booleano o string (en ese caso, hacer la conversión)
    // console.log(secure);
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
    };
  }
}
