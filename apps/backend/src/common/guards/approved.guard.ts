import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@golden-abode/types';

import { UsersService } from '../../modules/users/users.service';
import { ALLOW_UNAPPROVED_KEY } from '../decorators/allow-unapproved.decorator';

export const ACCOUNT_NOT_APPROVED = 'ACCOUNT_NOT_APPROVED';

// Decision 0059: vendors and ustaads need an approved account for business
// routes. Applied per controller after JwtAuthGuard and RolesGuard, locked by
// default; onboarding routes opt out with @AllowUnapproved().
@Injectable()
export class ApprovedGuard implements CanActivate {
  constructor(
    private readonly usersService: UsersService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest().user as
      | { sub: string; role: Role }
      | undefined;
    // JwtAuthGuard runs first and rejects anonymous calls on these controllers.
    if (!user) {
      return false;
    }

    // Admins and customers need no approval.
    if (user.role !== Role.VENDOR && user.role !== Role.ARTISAN) {
      return true;
    }

    // Route level only: a class-level tag would open every route on the
    // controller at once, which is exactly the silent hole 0059 exists to stop.
    const allowUnapproved = this.reflector.get<boolean>(ALLOW_UNAPPROVED_KEY, context.getHandler());
    if (allowUnapproved) {
      return true;
    }

    // Read fresh, not from the token, so approving or rejecting applies at once.
    const dbUser = await this.usersService.findById(user.sub);
    if (!dbUser?.isApproved) {
      // An object body replaces Nest's default one, so statusCode and error
      // must be set here or the error filter reports "Internal Server Error".
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Your account is waiting for admin approval. You cannot use this feature yet.',
        code: ACCOUNT_NOT_APPROVED,
      });
    }
    return true;
  }
}
