import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';

import { UserRole } from 'src/modules/users/entities';
import { RolesGuard } from '../guards/roles.guard';

export const ROLES_KEY = 'role';
export function RequireRole(...roles: UserRole[]) {
  return applyDecorators(SetMetadata(ROLES_KEY, roles), UseGuards(RolesGuard));
}
