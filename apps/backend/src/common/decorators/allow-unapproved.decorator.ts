import { SetMetadata } from '@nestjs/common';

export const ALLOW_UNAPPROVED_KEY = 'allowUnapproved';

// Opens a route on an ApprovedGuard controller to vendors and ustaads who are
// not approved yet: onboarding and their own profile (decision 0059 §3).
// Everything else on those controllers stays locked by default.
export const AllowUnapproved = () => SetMetadata(ALLOW_UNAPPROVED_KEY, true);
