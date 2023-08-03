export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US', {}).format(n)
}

export function formatDuration(ns: number): string {
  return new Intl.NumberFormat('en-US', { style: 'unit', unit: 'millisecond' }).format(ns / 1_000_000)
}
