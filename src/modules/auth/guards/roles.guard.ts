import { Injectable, CanActivate, ExecutionContext, InternalServerErrorException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { User, UserRole } from 'src/modules/users/entities';
import { ROLES_KEY } from '../decorators';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) return true;

    const req: Express.Request = context.switchToHttp().getRequest();
    const user = req['user'] as User | undefined;
    if (!user) throw new InternalServerErrorException('User not authenticated');

    return requiredRoles.some((role) => user.roles.includes(role));
  }
}
