export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export type ShowToastOptions = {
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
};

export type ToastStateItem = {
  id: string;
  message: string;
  variant: ToastVariant;
  durationMs: number;
};

export type ToastHostProps = {
  topOffset: number;
};
