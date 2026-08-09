import { HttpModule } from '@nestjs/axios';
import { APP_GUARD } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsersModule } from '../users/users.module';
import { OAuthGuard } from './guards/auth.guard';
import { OAuthService } from './services/oauth.service';
import { AuthIdentityService } from './services/auth-identity.service';
import { TokenVerifierService } from './services/token-verifier.service';
import { AuthSessionService } from './services/auth-session.service';
import { OAuthTransactionService } from './services/oauth-transaction.service';
import { AuthController } from './controllers/auth.controller';
import { OAuthController } from './controllers/oauth.controller';
import { AuthSession } from './entities/auth-session.entity';
import { OAuthTransaction } from './entities/oauth-transaction.entity';

@Module({
  controllers: [OAuthController, AuthController],
  providers: [
    OAuthService,
    AuthIdentityService,
    TokenVerifierService,
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
