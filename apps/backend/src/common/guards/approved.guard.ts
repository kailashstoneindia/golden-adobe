import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Role } from '@golden-abode/types';
import { UsersService } from '../../modules/users/users.service';

@Injectable()
export class ApprovedGuard implements CanActivate {
  constructor(private usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false; // Rely on JwtAuthGuard to handle 401s if no user is present
    }

    // Admins and Customers do not need admin approval to use the platform.
    if (user.role === Role.ADMIN || user.role === Role.CUSTOMER) {
      return true;
    }

    // For Vendors and Artisans, fetch fresh approval status from DB
    // We fetch from DB instead of relying purely on JWT to allow instant revocation/approval
    const dbUser = await this.usersService.findById(user.sub);
    
    if (!dbUser) {
      return false;
    }

    if (!dbUser.isApproved) {
      throw new ForbiddenException(
        'Your profile is pending Admin approval. You cannot access this feature yet.',
      );
    }

    return true;
  }
}
