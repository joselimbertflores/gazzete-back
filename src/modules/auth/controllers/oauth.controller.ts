import { Controller, Get, Query, Res, Req, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from 'src/config/env.validation';
import { AuthCookieService, OAuthService } from '../services';
import { Cookies, Public } from '../decorators';
import { AuthCallbackParamsDto } from '../dtos';

@Controller('auth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private readonly oAuthService: OAuthService,
    private readonly authCookieService: AuthCookieService,
    private readonly configService: ConfigService<EnvironmentVariables>,
  ) {}

  // Esta ruta inicia el flujo OAuth. Construye la URL de autorización y redirige al usuario al IdP.
  @Public()
  @Get('login')
  login(@Res() response: Response) {
    const { url, state } = this.oAuthService.buildAuthorizeUrl();
    this.authCookieService.setOAuthStateCookie(response, state);

    return response.redirect(url);
  }

  @Public()
  @Get('callback')
  async callback(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Query() queryParams: AuthCallbackParamsDto,
    @Cookies('gazette_oauth_state') cookieState: string,
  ) {
    if (queryParams.error) {
      return this.redirectToError(response, request, queryParams.error);
    }

    if (!queryParams.state || queryParams.state !== cookieState) {
      return this.redirectToError(response, request, 'invalid_state');
    }

    if (!queryParams.code) {
      return this.redirectToError(response, request, 'missing_code');
    }

    try {
      const redirectUrl = await this.completeAuthorizationCodeFlow(queryParams.code, response);
      console.log(redirectUrl);
      return response.redirect(redirectUrl);
    } catch (error: unknown) {
      console.log(error);
      this.logger.error(
        'OAuth callback failed during token exchange or user synchronization',
        error instanceof Error ? error.stack : String(error),
      );

      return this.redirectToError(response, request, 'token_exchange_failed');
    }
  }

  private redirectToError(response: Response, request: Request, error: string) {
    this.authCookieService.clearOAuthStateCookie(response);

    const redirectUrl = this.buildRedirectUrl(this.configService.getOrThrow<string>('AUTH_ERROR_REDIRECT'), request, {
      error,
    });

    return response.redirect(redirectUrl);
  }

  private buildRedirectUrl(target: string, request: Request, params?: Record<string, string | undefined>) {
    const isAbsolute = /^https?:\/\//i.test(target);
    const baseUrl = `${request.protocol}://${request.get('host')}`;

    const url = isAbsolute ? new URL(target) : new URL(target, baseUrl);

    for (const [key, value] of Object.entries(params ?? {})) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }
    return isAbsolute ? url.toString() : `${url.pathname}${url.search}`;
  }

  private async completeAuthorizationCodeFlow(code: string, response: Response) {
    const { tokens, url } = await this.oAuthService.exchangeAuthorizationCode(code);
    this.authCookieService.clearOAuthStateCookie(response);
    this.authCookieService.setAuthCookies(response, tokens);

    return url;
  }
}
