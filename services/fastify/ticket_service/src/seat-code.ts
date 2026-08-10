export const seatCodePattern = '^[A-D][1-5]$';

const seatCodeExpression = new RegExp(seatCodePattern);

export function isSeatCode(value: string): boolean {
  return seatCodeExpression.test(value);
}
