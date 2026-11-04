import { toPaise } from '../money';

describe('toPaise', () => {
  it('converts decimal rupees exactly', () => {
    expect(toPaise('1234.56')).toBe(123456);
    expect(toPaise(500)).toBe(50000);
    expect(toPaise('0.1')).toBe(10);
  });
});
