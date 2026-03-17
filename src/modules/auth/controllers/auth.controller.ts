import { Controller, Get, Post, Res } from '@nestjs/common';

import type { Response } from 'express';

import { User } from 'src/modules/users/entities';
import { GetAuthUser } from '../decorators';

@Controller('auth')
export class AuthController {
  constructor() {}

  @Get('status')
  checkAuthStatus(@GetAuthUser() user: User) {
    return { user };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('gazette_access');
    res.clearCookie('gazette_refresh');

    return {
      ok: true,
      message: 'Logged out from this system',
    };
  }
}
