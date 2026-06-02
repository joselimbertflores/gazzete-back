import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PaginationParamsDto } from 'src/modules/common';

import { UsersService } from './users.service';
import { ImportUserFromIdentityDto, SearchIdentityCandidatesDto, UpdateUserDto } from './dtos';
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

  @Get('identity-candidates')
  searchIdentityCandidates(@Query() queryParams: SearchIdentityCandidatesDto) {
    return this.userService.searchIdentityCandidates(queryParams.term);
  }

  @Get('identity-candidates/:externalKey')
  findIdentityCandidateByExternalKey(@Param('externalKey') externalKey: string) {
    return this.userService.findIdentityCandidateByExternalKey(externalKey);
  }

  @Post('import-from-identity')
  importFromIdentity(@Body() body: ImportUserFromIdentityDto) {
    return this.userService.importFromIdentity(body);
  }

  @Patch(':id/role')
  updateRole(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.userService.updateRole(id, body);
  }
}
