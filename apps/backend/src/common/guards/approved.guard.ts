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

    const allowUnapproved = this.reflector.getAllAndOverride<boolean>(ALLOW_UNAPPROVED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowUnapproved) {
      return true;
    }

    // Read fresh, not from the token, so approving or rejecting applies at once.
    const dbUser = await this.usersService.findById(user.sub);
    if (!dbUser?.isApproved) {
      throw new ForbiddenException({
        message: 'Your account is waiting for admin approval. You cannot use this feature yet.',
        code: ACCOUNT_NOT_APPROVED,
      });
    }
    return true;
  }
}
