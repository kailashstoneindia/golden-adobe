import { TOAST_MESSAGES } from '../constants/toast.constants';
import { useToastStore } from '../stores/useToastStore';
import type { ShowToastOptions, ToastVariant } from '../types/toast.types';

function showToastMessage(message: string, variant: ToastVariant): void {
  useToastStore.getState().showToast({ message, variant });
}

export function useToast() {
  const showToast = useToastStore((toastStore) => toastStore.showToast);
  const hideToast = useToastStore((toastStore) => toastStore.hideToast);

  return {
    showToast,
    hideToast,
    showSuccess: (message: string) => showToastMessage(message, 'success'),
    showError: (message: string) => showToastMessage(message, 'error'),
    showWarning: (message: string) => showToastMessage(message, 'warning'),
    showInfo: (message: string) => showToastMessage(message, 'info'),
  };
}

export function showAppToast(options: ShowToastOptions): void {
  useToastStore.getState().showToast(options);
}

export { TOAST_MESSAGES };
