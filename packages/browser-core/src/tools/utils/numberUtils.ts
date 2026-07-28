export function round(num: number, decimals: 0 | 1 | 2 | 3 | 4) {
  return +num.toFixed(decimals)
}

export function isPercentage(value: unknown) {
  return isNumber(value) && value >= 0 && value <= 100
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number'
}
