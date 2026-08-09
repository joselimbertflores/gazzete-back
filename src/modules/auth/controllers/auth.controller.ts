import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Request, Response } from 'express';

import { EnvironmentVariables } from 'src/config';
import { User } from 'src/modules/users/entities';
import {
  getAuthCookieOptions,
  OAUTH_TRANSACTION_COOKIE_NAME,
  OAUTH_TRANSACTION_COOKIE_PATH,
  SESSION_COOKIE_NAME,
  usesSecureAuthCookies,
} from '../auth-cookies';
import { GetAuthUser, Public } from '../decorators';
import { AuthSessionService } from '../services/auth-session.service';

@Controller('auth')
export class AuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly authSessionService: AuthSessionService,
    configService: ConfigService<EnvironmentVariables, true>,
  ) {
    this.secureCookies = usesSecureAuthCookies(configService.getOrThrow('GAZETTE_PUBLIC_URL', { infer: true }));
  }

  @Get('me')
  getMe(@GetAuthUser() user: User) {
    return { user };
  }

  @Public()
  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const sessionId = request.cookies?.[SESSION_COOKIE_NAME] as string | undefined;

    response.clearCookie(SESSION_COOKIE_NAME, getAuthCookieOptions(this.secureCookies));
    response.clearCookie(
      OAUTH_TRANSACTION_COOKIE_NAME,
      getAuthCookieOptions(this.secureCookies, OAUTH_TRANSACTION_COOKIE_PATH),
    );

    if (sessionId) {
      await this.authSessionService.deleteSession(sessionId);
    }

    return {
      ok: true,
      message: 'Logged out from this system',
    };
  }
}
