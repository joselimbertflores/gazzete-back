import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const Cookies = createParamDecorator((key: string, ctx: ExecutionContext) => {
  const request: Request = ctx.switchToHttp().getRequest();
  return key ? request.cookies[key] : request.cookies;
});
