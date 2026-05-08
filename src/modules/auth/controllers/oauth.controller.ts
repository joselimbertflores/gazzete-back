import { Controller, Get, Logger, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { AuthCookieService, AuthRedirectService, OAuthService } from '../services';
import { Public } from '../decorators';
import { AuthCallbackParamsDto } from '../dtos';

@Controller('auth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private readonly oauthService: OAuthService,
    private readonly authCookieService: AuthCookieService,
    private readonly authRedirectService: AuthRedirectService,
  ) {}

  @Public()
  @Get('login')
  login(@Res() response: Response) {
    const { url, state } = this.oauthService.buildAuthorizeUrl();
    this.authCookieService.setOAuthStateCookie(response, state);

    return response.redirect(url);
  }

  @Public()
  @Get('callback')
  async callback(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Query() queryParams: AuthCallbackParamsDto,
  ) {
    if (queryParams.error) {
      return this.redirectToError(response, queryParams.error);
    }

    const cookieState = this.authCookieService.getOAuthState(request);

    if (!queryParams.state || queryParams.state !== cookieState) {
      return this.redirectToError(response, 'invalid_state');
    }

    if (!queryParams.code) {
      return this.redirectToError(response, 'missing_code');
    }

    try {
      const redirectUrl = await this.completeAuthorizationCodeFlow(queryParams.code, response);
      return response.redirect(redirectUrl);
    } catch (error: unknown) {
      this.logger.error(
        'OAuth callback failed during token exchange or user synchronization',
        error instanceof Error ? error.stack : String(error),
      );

      return this.redirectToError(response, 'token_exchange_failed');
    }
  }

  private redirectToError(response: Response, error: string) {
    this.authCookieService.clearOAuthStateCookie(response);
    return response.redirect(this.authRedirectService.buildErrorRedirectUrl(error));
  }

  private async completeAuthorizationCodeFlow(code: string, response: Response) {
    const tokens = await this.oauthService.completeAuthorizationCodeFlow(code);
    this.authCookieService.clearOAuthStateCookie(response);
    this.authCookieService.setAuthCookies(response, tokens);

    return this.authRedirectService.buildSuccessRedirectUrl();
  }
}
