import { Controller, Get, Logger, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { AuthCookieService, AuthRedirectService, AuthSessionService, OAuthService } from '../services';
import { Public } from '../decorators';
import { AuthCallbackParamsDto } from '../dtos';

@Controller('auth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private readonly oauthService: OAuthService,
    private readonly authCookieService: AuthCookieService,
    private readonly authRedirectService: AuthRedirectService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  @Public()
  @Get('login')
  login(@Res() response: Response) {
    const { url, state, codeVerifier } = this.oauthService.buildAuthorizeUrl();
    this.authCookieService.setOAuthTransactionCookies(response, state, codeVerifier);

    return response.redirect(url);
  }

  @Public()
  @Get('callback')
  async callback(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Query() queryParams: AuthCallbackParamsDto,
  ) {
    const cookieState = this.authCookieService.getOAuthState(request);

    // Validate state before processing success or error callbacks.
    if (!queryParams.state || queryParams.state !== cookieState) {
      return this.redirectToError(response, 'invalid_state');
    }

    if (queryParams.error) {
      return this.redirectToError(response, queryParams.error);
    }

    if (!queryParams.code) {
      return this.redirectToError(response, 'missing_code');
    }

    const codeVerifier = this.authCookieService.getPkceVerifier(request);

    if (!codeVerifier) {
      return this.redirectToError(response, 'missing_code_verifier');
    }

    try {
      const redirectUrl = await this.completeAuthorizationCodeFlow(queryParams.code, codeVerifier, request, response);
      return response.redirect(redirectUrl);
    } catch (error: unknown) {
      this.logger.error(
        'OAuth callback failed during token exchange or user synchronization',
        this.buildSafeErrorLog(error),
      );

      return this.redirectToError(response, 'token_exchange_failed');
    }
  }

  private redirectToError(response: Response, error: string) {
    this.authCookieService.clearOAuthTransactionCookies(response);
    return response.redirect(this.authRedirectService.buildErrorRedirectUrl(error));
  }

  private async completeAuthorizationCodeFlow(
    code: string,
    codeVerifier: string,
    request: Request,
    response: Response,
  ) {
    const session = await this.oauthService.completeAuthorizationCodeFlow(code, codeVerifier);
    const previousSessionId = this.authCookieService.getSessionId(request);

    if (previousSessionId && previousSessionId !== session.id) {
      await this.authSessionService.deleteSession(previousSessionId);
    }

    this.authCookieService.clearOAuthTransactionCookies(response);
    this.authCookieService.setSessionCookie(response, session.id, session.refreshTokenExpiresAt);

    return this.authRedirectService.buildSuccessRedirectUrl();
  }

  private buildSafeErrorLog(error: unknown) {
    const errorRecord = this.asErrorRecord(error);
    const safeLog: Record<string, string | number> = {
      errorType: error instanceof Error ? error.name : typeof error,
      message: 'OAuth callback processing failed',
    };

    const status = errorRecord?.response?.status ?? errorRecord?.status;
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
        response?: { status?: string | number };
      }
    | undefined {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    return error as {
      code?: string | number;
      status?: string | number;
      response?: { status?: string | number };
    };
  }
}
