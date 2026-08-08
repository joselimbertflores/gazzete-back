import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { CookieOptions, Request, Response } from 'express';

import { EnvironmentVariables } from 'src/config';

@Injectable()
export class AuthCookieService {
  private readonly sessionCookieName = 'gazette_session';
  private readonly oauthTransactionCookieName = 'gazette_oauth_transaction';
  private readonly oauthTransactionPath = '/auth';
  private readonly oauthTransactionTtlMs = 5 * 60 * 1000;

  constructor(private readonly configService: ConfigService<EnvironmentVariables>) {}

  setOAuthTransactionCookie(response: Response, transactionId: string): void {
    const options = this.getCookieOptions(this.oauthTransactionTtlMs, this.oauthTransactionPath);
    response.cookie(this.oauthTransactionCookieName, transactionId, options);
  }

  clearOAuthTransactionCookie(response: Response): void {
    const options = this.getBaseOptions(this.oauthTransactionPath);
    response.clearCookie(this.oauthTransactionCookieName, options);
  }

  setSessionCookie(response: Response, sessionId: string, expiresAt: Date): void {
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
    this.clearOAuthTransactionCookie(response);
  }

  getSessionId(request: Request): string | undefined {
    return request.cookies?.[this.sessionCookieName] as string | undefined;
  }

  getOAuthTransactionId(request: Request): string | undefined {
    return request.cookies?.[this.oauthTransactionCookieName] as string | undefined;
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
