import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { CookieOptions, Request, Response } from 'express';

import { EnvironmentVariables } from 'src/config';

@Injectable()
export class AuthCookieService {
  private readonly sessionCookieName = 'gazette_session';
  private readonly legacyAccessCookieName = 'gazette_access';
  private readonly legacyRefreshCookieName = 'gazette_refresh';
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

  setSessionCookie(response: Response, sessionId: string, expiresAt: Date): void {
    this.clearLegacyAuthCookies(response);
    response.cookie(this.sessionCookieName, sessionId, {
      ...this.getBaseOptions(),
      expires: expiresAt,
    });
  }

  clearSessionCookie(response: Response): void {
    response.clearCookie(this.sessionCookieName, this.getBaseOptions());
  }

  clearSessionCookies(response: Response) {
    this.clearSessionCookie(response);
    this.clearLegacyAuthCookies(response);
    this.clearOAuthTransactionCookies(response);
  }

  getSessionId(request: Request): string | undefined {
    return request.cookies?.[this.sessionCookieName] as string | undefined;
  }

  getOAuthState(request: Request): string | undefined {
    return request.cookies[this.stateCookieName] as string | undefined;
  }

  getPkceVerifier(request: Request): string | undefined {
    return request.cookies[this.pkceVerifierCookieName] as string | undefined;
  }

  private clearLegacyAuthCookies(response: Response): void {
    response.clearCookie(this.legacyAccessCookieName, this.getBaseOptions());
    response.clearCookie(this.legacyRefreshCookieName, this.getBaseOptions());
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
