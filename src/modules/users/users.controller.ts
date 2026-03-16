import { Controller, Get, Query } from '@nestjs/common';
import { PaginationParamsDto } from 'src/modules/common';

import { UsersService } from './users.service';

// @ProtectedResource(Resource.USERS)
@Controller('users')
export class UsersController {
  constructor(private readonly userService: UsersService) {}

  @Get()
  findAll(@Query() queryParams: PaginationParamsDto) {
    return this.userService.findAll(queryParams);
  }
}
