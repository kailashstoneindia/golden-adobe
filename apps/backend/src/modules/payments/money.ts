// Decision 0054: money is integer paise everywhere. grand_total is a
// DECIMAL(12,2) that Sequelize returns as a string, so this is the one place
// a rupee amount is converted — never multiply by 100 inline.
export function toPaise(value: number | string): number {
  return Math.round(Number(value) * 100);
}
