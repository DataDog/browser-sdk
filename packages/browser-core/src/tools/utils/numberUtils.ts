export function round(num: number, decimals: 0 | 1 | 2 | 3 | 4) {
  return +num.toFixed(decimals)
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number'
}
