export const ERROR_MESSAGES = {
  generic: 'Something went wrong. Please try again.',
  invalidEmail: 'Enter a valid email address.',
  invalidPassword: 'Password must be at least 8 characters.',
  invalidName: 'Enter your full name.',
  invalidSecretKey: 'Enter the admin registration secret key.',
  adminOnly: 'This account does not have admin access.',
  sessionExpired: 'Your session expired. Please sign in again.',
  userNotFound: 'User not found.',
  loadUsersFailed: 'Could not load users.',
  loadStatsFailed: 'Could not load dashboard stats.',
  approvalFailed: 'Could not update approval status.',
} as const;
