import { create } from 'zustand';

import { TOAST_CONSTANTS } from '../constants/toast.constants';
import type { ShowToastOptions, ToastStateItem, ToastVariant } from '../types/toast.types';

type ToastStoreState = {
  toast: ToastStateItem | null;
  showToast: (options: ShowToastOptions) => void;
  hideToast: () => void;
};

let toastSequence = 0;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function clearHideTimer(): void {
  if (!hideTimer) {
    return;
  }
  clearTimeout(hideTimer);
  hideTimer = null;
}

function resolveDurationMs(variant: ToastVariant, durationMs?: number): number {
  if (durationMs !== undefined) {
    return durationMs;
  }
  if (variant === 'error') {
    return TOAST_CONSTANTS.errorDurationMs;
  }
  return TOAST_CONSTANTS.defaultDurationMs;
}

export const useToastStore = create<ToastStoreState>((set) => ({
  toast: null,

  showToast: (options: ShowToastOptions) => {
    clearHideTimer();
    toastSequence += 1;
    const variant = options.variant ?? 'info';
    const durationMs = resolveDurationMs(variant, options.durationMs);
    const nextToast: ToastStateItem = {
      id: `toast-${toastSequence}`,
      message: options.message,
      variant,
      durationMs,
    };
    set({ toast: nextToast });
    hideTimer = setTimeout(() => {
      set({ toast: null });
      hideTimer = null;
    }, durationMs);
  },

  hideToast: () => {
    clearHideTimer();
    set({ toast: null });
  },
}));
