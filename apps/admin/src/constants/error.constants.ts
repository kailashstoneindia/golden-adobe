export const ERROR_MESSAGES = {
  generic: 'Something went wrong. Please try again.',
  invalidOtp: 'Enter the 6-digit code.',
  invalidPhone: 'Enter a valid 10-digit mobile number.',
  adminOnly: 'This account does not have admin access.',
  newUserBlocked: 'Complete registration in the mobile app first.',
  sessionExpired: 'Your session expired. Please sign in again.',
  userNotFound: 'User not found.',
  loadUsersFailed: 'Could not load users.',
  loadStatsFailed: 'Could not load dashboard stats.',
  approvalFailed: 'Could not update approval status.',
} as const;
