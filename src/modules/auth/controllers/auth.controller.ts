import { Controller, Get, Post, Res } from '@nestjs/common';

import type { Response } from 'express';

import { User } from 'src/modules/users/entities';
import { GetAuthUser, Public } from '../decorators';
import { AuthCookieService } from '../services';

@Controller('auth')
export class AuthController {
  constructor(private readonly authCookieService: AuthCookieService) {}

  @Get('me')
  getMe(@GetAuthUser() user: User) {
    return { user };
  }

  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    this.authCookieService.clearAuthCookies(res);

    return {
      ok: true,
      message: 'Logged out from this system',
    };
  }
}
