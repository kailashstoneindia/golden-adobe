import { create } from 'zustand';

interface OnboardingState {
  phone: string | null;
  onboardingToken: string | null;
  devOtp: string | null;
  setPhone: (phone: string) => void;
  setOnboardingToken: (token: string) => void;
  setDevOtp: (otp: string | null) => void;
  clear: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  phone: null,
  onboardingToken: null,
  devOtp: null,

  setPhone: (phone) => set({ phone }),
  setOnboardingToken: (onboardingToken) => set({ onboardingToken }),
  setDevOtp: (devOtp) => set({ devOtp }),
  clear: () => set({ phone: null, onboardingToken: null, devOtp: null }),
}));
