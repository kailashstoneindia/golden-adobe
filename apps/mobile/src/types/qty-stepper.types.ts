export type QtyStepperProps = {
  quantity: number;
  isDisabled?: boolean;
  onIncrease: () => void;
  onDecrease: () => void;
};
