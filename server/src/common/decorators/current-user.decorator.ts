import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserRecord } from '../../users/user.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserRecord => {
    const request = ctx.switchToHttp().getRequest<{ user: UserRecord }>();
    return request.user;
  },
);
