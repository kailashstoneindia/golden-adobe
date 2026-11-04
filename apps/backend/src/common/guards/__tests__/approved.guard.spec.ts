import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@golden-abode/types';

import { ALLOW_UNAPPROVED_KEY } from '../../decorators/allow-unapproved.decorator';
import { ApprovedGuard } from '../approved.guard';

// Decision 0057: vendors and ustaads must be approved to use business routes.
describe('ApprovedGuard', () => {
  const users = new Map<string, { isApproved: boolean }>();
  const usersService = { findById: jest.fn(async (id: string) => users.get(id) ?? null) };

  function context(user: { sub: string; role: Role } | undefined, allowUnapproved = false) {
    const handler = () => undefined;
    if (allowUnapproved) Reflect.defineMetadata(ALLOW_UNAPPROVED_KEY, true, handler);
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => handler,
      getClass: () => class {},
    } as unknown as ExecutionContext;
  }

  const guard = new ApprovedGuard(usersService as never, new Reflector());

  beforeEach(() => {
    users.clear();
    users.set('approved-vendor', { isApproved: true });
    users.set('pending-vendor', { isApproved: false });
    users.set('pending-ustaad', { isApproved: false });
  });

  it('lets customers and admins through without a lookup', async () => {
    await expect(guard.canActivate(context({ sub: 'c', role: Role.CUSTOMER }))).resolves.toBe(true);
    await expect(guard.canActivate(context({ sub: 'a', role: Role.ADMIN }))).resolves.toBe(true);
    expect(usersService.findById).not.toHaveBeenCalled();
  });

  it('lets an approved vendor through', async () => {
    await expect(
      guard.canActivate(context({ sub: 'approved-vendor', role: Role.VENDOR })),
    ).resolves.toBe(true);
  });

  it('refuses an unapproved vendor or ustaad with ACCOUNT_NOT_APPROVED', async () => {
    for (const [sub, role] of [
      ['pending-vendor', Role.VENDOR],
      ['pending-ustaad', Role.ARTISAN],
    ] as const) {
      const error = await guard.canActivate(context({ sub, role })).catch((caught) => caught);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'ACCOUNT_NOT_APPROVED',
      });
    }
  });

  it('lets an unapproved user through on a route marked @AllowUnapproved', async () => {
    await expect(
      guard.canActivate(context({ sub: 'pending-ustaad', role: Role.ARTISAN }, true)),
    ).resolves.toBe(true);
  });

  it('refuses a user who no longer exists', async () => {
    await expect(
      guard.canActivate(context({ sub: 'deleted', role: Role.VENDOR })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reads approval fresh on every request, so approving takes effect at once', async () => {
    const ctx = context({ sub: 'pending-vendor', role: Role.VENDOR });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    users.set('pending-vendor', { isApproved: true });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
