import { HttpModule } from '@nestjs/axios';
import { APP_GUARD } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

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
  AuthSessionService,
  OAuthTransactionService,
} from './services';
import { AuthController, OAuthController } from './controllers';
import { AuthSession, OAuthTransaction } from './entities';

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
    AuthSessionService,
    OAuthTransactionService,
    {
      provide: APP_GUARD,
      useClass: OAuthGuard,
    },
  ],
  imports: [HttpModule, TypeOrmModule.forFeature([AuthSession, OAuthTransaction]), UsersModule],
})
export class AuthModule {}
