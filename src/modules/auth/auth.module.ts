import { HttpModule } from '@nestjs/axios';
import { APP_GUARD } from '@nestjs/core';
import { Module } from '@nestjs/common';

import { UsersModule } from '../users/users.module';
import { OAuthGuard } from './guards/auth.guard';

import { OAuthuthService, IdentityService, JwksService, TokenVerifierService } from './services';
import { AuthController, OAuthController } from './controllers';
@Module({
  controllers: [OAuthController, AuthController],
  providers: [
    OAuthuthService,
    IdentityService,
    {
      provide: APP_GUARD,
      useClass: OAuthGuard,
    },
    JwksService,
    TokenVerifierService,
  ],
  imports: [HttpModule, UsersModule],
})
export class AuthModule {}
