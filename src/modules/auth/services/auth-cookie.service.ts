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
  private readonly pkceVerifierCookieName = 'gazette_pkce_verifier';
  private readonly oauthTransactionPath = '/auth';
  private readonly oauthTransactionTtlMs = 5 * 60 * 1000;

  constructor(private readonly configService: ConfigService<EnvironmentVariables>) {}

  setOAuthTransactionCookies(response: Response, state: string, codeVerifier: string) {
    // Short-lived OAuth transaction cookies keep PKCE server-side from the browser application's perspective.
    const options = this.getCookieOptions(this.oauthTransactionTtlMs, this.oauthTransactionPath);
    response.cookie(this.stateCookieName, state, options);
    response.cookie(this.pkceVerifierCookieName, codeVerifier, options);
  }

  clearOAuthTransactionCookies(response: Response) {
    const options = this.getBaseOptions(this.oauthTransactionPath);
    response.clearCookie(this.stateCookieName, options);
    response.clearCookie(this.pkceVerifierCookieName, options);
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

  clearSessionCookies(response: Response) {
    this.clearAuthCookies(response);
    this.clearOAuthTransactionCookies(response);
  }

  getAccessToken(request: Request): string | undefined {
    return request.cookies[this.accessCookieName] as string | undefined;
  }

  getRefreshToken(request: Request): string | undefined {
    return request.cookies[this.refreshCookieName] as string | undefined;
  }

  getOAuthState(request: Request): string | undefined {
    return request.cookies[this.stateCookieName] as string | undefined;
  }

  getPkceVerifier(request: Request): string | undefined {
    return request.cookies[this.pkceVerifierCookieName] as string | undefined;
  }

  private getBaseOptions(path = '/'): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.configService.getOrThrow<boolean>('AUTH_COOKIE_SECURE'),
      path,
    };
  }

  private getCookieOptions(maxAge: number, path = '/'): CookieOptions {
    return {
      ...this.getBaseOptions(path),
      maxAge,
    };
  }
}
