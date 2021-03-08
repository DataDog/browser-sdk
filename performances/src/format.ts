import { ProfilingResult, ProfilingResults } from './types'

const DURATION_UNITS = ['μs', 'ms', 's']

const BYTES_UNITS = ['B', 'kB', 'MB']

export function formatProfilingResults(results: ProfilingResults) {
  return `\
Memory (median): ${formatNumberWithUnit(results.memory.sdk, BYTES_UNITS)} ${formatPercent(results.memory)}
CPU: ${formatNumberWithUnit(results.cpu.sdk, DURATION_UNITS)} ${formatPercent(results.cpu)}
Bandwidth:
  upload: ${formatNumberWithUnit(results.upload.sdk, BYTES_UNITS)}
  download: ${formatNumberWithUnit(results.download.sdk, BYTES_UNITS)}`
}

function formatNumberWithUnit(n: number, units: string[]) {
  let unit: string
  for (unit of units) {
    if (n < 1000) {
      break
    }
    n /= 1000
  }
  return `${formatNumber(n)} ${unit!}`
}

function formatPercent({ total, sdk }: ProfilingResult) {
  return `(${formatNumber((sdk / total) * 100)}%)`
}

function formatNumber(n: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: n < 10 ? 2 : n < 100 ? 1 : 0 }).format(n)
}
