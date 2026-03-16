import { Controller, Get, Query, Res, Req, UnauthorizedException, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';

import { AuthCallbackParamsDto } from '../dtos';
import { Cookies, Public } from '../decorators';
import { OAuthuthService } from '../services';

@Controller('auth')
export class OAuthController {
  constructor(private oAuthService: OAuthuthService) {}

  @Get('login')
  @Public()
  login(@Res() response: Response) {
    const { url, state } = this.oAuthService.buildAuthorizeUrl();
    response.cookie('oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 5 * 60 * 1000,
    });
    return response.redirect(url);
  }

  @Get('callback')
  @Public()
  async callback(
    @Query() queryParams: AuthCallbackParamsDto,
    @Cookies('oauth_state') cookieState: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    /**
     * 1. Manejar errores devueltos por /authorize
     */
    if (queryParams.error) {
      res.clearCookie('oauth_state');
      return res.redirect(`http://localhost:7001/auth/error?error=${queryParams.error}`);
    }

    /**
     * 2. Validar state (protección CSRF)
     */
    if (!queryParams.state || queryParams.state !== cookieState) {
      res.clearCookie('oauth_state');
      throw new UnauthorizedException('Invalid OAuth state');
    }

    if (!queryParams.code) {
      throw new BadRequestException('Missing authorization code');
    }

    const { result, url } = await this.oAuthService.exchangeAuthorizationCode(queryParams.code);

    res.clearCookie('oauth_state');

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

    return res.redirect(url);
  }
}
