import { Controller, Get, Logger, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import { EnvironmentVariables } from 'src/config';
import {
  getAuthCookieOptions,
  OAUTH_TRANSACTION_COOKIE_NAME,
  OAUTH_TRANSACTION_COOKIE_PATH,
  SESSION_COOKIE_NAME,
  usesSecureAuthCookies,
} from '../auth-cookies';
import { AuthSessionService } from '../services/auth-session.service';
import { OAuthService } from '../services/oauth.service';
import { OAUTH_TRANSACTION_TTL_MS, OAuthTransactionService } from '../services/oauth-transaction.service';
import { Public } from '../decorators';
import { AuthCallbackParamsDto } from '../dtos/auth-callback-params.dto';

@Controller('auth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);
  private readonly secureCookies: boolean;

  constructor(
    private readonly oauthService: OAuthService,
    private readonly authSessionService: AuthSessionService,
    private readonly oauthTransactionService: OAuthTransactionService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {
    this.secureCookies = usesSecureAuthCookies(configService.getOrThrow('GAZETTE_PUBLIC_URL', { infer: true }));
  }

  @Public()
  @Get('login')
  async login(@Res() response: Response) {
    const { url, transactionId } = await this.oauthService.createAuthorizationRequest();
    response.cookie(OAUTH_TRANSACTION_COOKIE_NAME, transactionId, {
      ...getAuthCookieOptions(this.secureCookies, OAUTH_TRANSACTION_COOKIE_PATH),
      maxAge: OAUTH_TRANSACTION_TTL_MS,
    });

    return response.redirect(url);
  }

  @Public()
  @Get('callback')
  async callback(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Query() queryParams: AuthCallbackParamsDto,
  ) {
    const transactionId = request.cookies?.[OAUTH_TRANSACTION_COOKIE_NAME] as string | undefined;
    if (!transactionId || !queryParams.state) {
      if (transactionId) await this.oauthTransactionService.discard(transactionId);
      return this.redirectToError(response, 'invalid_state');
    }

    const codeVerifier = await this.oauthTransactionService.consume(transactionId, queryParams.state);

    if (!codeVerifier) return this.redirectToError(response, 'invalid_state');

    if (queryParams.error) {
      return this.redirectToError(response, queryParams.error);
    }

    if (!queryParams.code) {
      return this.redirectToError(response, 'missing_code');
    }

    try {
      const session = await this.oauthService.completeAuthorizationCodeFlow(queryParams.code, codeVerifier);
      const previousSessionId = request.cookies?.[SESSION_COOKIE_NAME] as string | undefined;

      if (previousSessionId && previousSessionId !== session.id) {
        await this.authSessionService.deleteSession(previousSessionId);
      }

      response.cookie(SESSION_COOKIE_NAME, session.id, {
        ...getAuthCookieOptions(this.secureCookies),
        expires: session.refreshTokenExpiresAt,
      });
      this.clearOAuthTransactionCookie(response);

      return response.redirect(this.buildFrontendUrl('/admin'));
    } catch (error: unknown) {
      this.logger.error(
        'OAuth callback failed during token exchange or user synchronization',
        this.buildSafeErrorLog(error),
      );

      return this.redirectToError(response, 'token_exchange_failed');
    }
  }

  private redirectToError(response: Response, error: string) {
    this.clearOAuthTransactionCookie(response);
    return response.redirect(this.buildFrontendUrl('/auth/error', { error }));
  }

  private clearOAuthTransactionCookie(response: Response): void {
    response.clearCookie(
      OAUTH_TRANSACTION_COOKIE_NAME,
      getAuthCookieOptions(this.secureCookies, OAUTH_TRANSACTION_COOKIE_PATH),
    );
  }

  private buildFrontendUrl(path: string, params?: Record<string, string>): string {
    const uiBaseUrl = this.configService.get('GAZETTE_UI_URL', { infer: true });

    if (!uiBaseUrl) {
      const searchParams = new URLSearchParams(params);
      const queryString = searchParams.toString();
      return queryString ? `${path}?${queryString}` : path;
    }

    const url = new URL(path, this.ensureTrailingSlash(uiBaseUrl));

    for (const [key, value] of Object.entries(params ?? {})) {
      url.searchParams.set(key, value);
    }

    return url.toString();
  }

  private ensureTrailingSlash(value: string): string {
    return value.endsWith('/') ? value : `${value}/`;
  }

  private buildSafeErrorLog(error: unknown) {
    const errorRecord = this.asErrorRecord(error);
    const safeLog: Record<string, string | number> = {
      errorType: error instanceof Error ? error.name : typeof error,
      message: 'OAuth callback processing failed',
    };

    const status = errorRecord?.response?.status ?? errorRecord?.statusCode ?? errorRecord?.status;
    const code = errorRecord?.code;

    if (typeof status === 'number' || typeof status === 'string') {
      safeLog.status = status;
    }

    if (typeof code === 'number' || typeof code === 'string') {
      safeLog.code = code;
    }

    return safeLog;
  }

  private asErrorRecord(error: unknown):
    | {
        code?: string | number;
        status?: string | number;
        statusCode?: string | number;
        response?: { status?: string | number };
      }
    | undefined {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    return error as {
      code?: string | number;
      status?: string | number;
      statusCode?: string | number;
      response?: { status?: string | number };
    };
  }
}
