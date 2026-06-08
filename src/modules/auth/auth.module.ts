import { HttpModule } from '@nestjs/axios';
import { APP_GUARD } from '@nestjs/core';
import { Module } from '@nestjs/common';

import { UsersModule } from '../users/users.module';
import { OAuthGuard } from './guards/auth.guard';

import {
  OAuthService,
  AuthIdentityService,
  JwksService,
  TokenVerifierService,
  AuthCookieService,
  AuthRedirectService,
  PkceService,
} from './services';
import { AuthController, OAuthController } from './controllers';

@Module({
  controllers: [OAuthController, AuthController],
  providers: [
    JwksService,
    OAuthService,
    AuthRedirectService,
    AuthCookieService,
    AuthIdentityService,
    TokenVerifierService,
    PkceService,
    {
      provide: APP_GUARD,
      useClass: OAuthGuard,
    },
  ],
  imports: [HttpModule, UsersModule],
})
export class AuthModule {}
