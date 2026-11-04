export function formatPaise(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

// Money is integer paise end to end; rupees only exist in the input box.
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}
