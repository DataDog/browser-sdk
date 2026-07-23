/**
 * Return true if the draw is successful
 *
 * @param threshold - Threshold between 0 and 100
 */
export function performDraw(threshold: number): boolean {
  return threshold !== 0 && Math.random() * 100 <= threshold
}

export function round(num: number, decimals: 0 | 1 | 2 | 3 | 4) {
  return +num.toFixed(decimals)
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number'
}
