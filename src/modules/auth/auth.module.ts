import { HttpModule } from '@nestjs/axios';
import { APP_GUARD } from '@nestjs/core';
import { Module } from '@nestjs/common';

import { UsersModule } from '../users/users.module';
import { OAuthGuard } from './guards/auth.guard';

import { OAuthService, AuthIdentityService, JwksService, TokenVerifierService, AuthCookieService } from './services';
import { AuthController, OAuthController } from './controllers';
@Module({
  controllers: [OAuthController, AuthController],
  providers: [
    JwksService,
    OAuthService,
    AuthCookieService,
    AuthIdentityService,
    TokenVerifierService,
    {
      provide: APP_GUARD,
      useClass: OAuthGuard,
    },
  ],
  imports: [HttpModule, UsersModule],
})
export class AuthModule {}
