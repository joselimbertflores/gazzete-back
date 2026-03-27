import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { PaginationParamsDto } from 'src/modules/common';

import { UsersService } from './users.service';
import { UpdateUserDto } from './dtos';
import { RequireRole } from '../auth/decorators';
import { UserRole } from './entities';

@RequireRole(UserRole.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly userService: UsersService) {}

  @Get()
  findAll(@Query() queryParams: PaginationParamsDto) {
    return this.userService.findAll(queryParams);
  }

  @Patch(':id/role')
  updateRole(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.userService.updateRole(id, body);
  }
}
