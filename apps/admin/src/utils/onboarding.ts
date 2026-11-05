import { Role, type AdminUserDto } from '@golden-abode/types';

const STAGE_TEXT: Record<string, string> = {
  BASIC_DETAILS: 'Basic details',
  SHOP_DETAILS: 'Shop details',
  BANK_DETAILS: 'Bank details',
  COMPLETED: 'Completed',
};

// Only vendors go through staged onboarding; everyone else shows a dash.
export function formatOnboardingStage(user: Pick<AdminUserDto, 'role' | 'onboardingStage'>) {
  if (user.role !== Role.VENDOR || !user.onboardingStage) {
    return '-';
  }
  return STAGE_TEXT[user.onboardingStage] ?? user.onboardingStage;
}
