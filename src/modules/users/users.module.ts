import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from './entities';
import { IdentityHubUsersClientService } from './identity-hub-users-client.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [IdentityHubUsersClientService, UsersService],
  imports: [HttpModule, TypeOrmModule.forFeature([User])],
  exports: [UsersService],
})
export class UsersModule {}
