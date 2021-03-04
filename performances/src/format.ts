import { ProfilingResult, ProfilingResults } from './types'

export function formatProfilingResults(results: ProfilingResults) {
  return `\
Memory (median): ${formatNumber(results.memory.sdk)} bytes ${formatPercent(results.memory)}
CPU: ${formatNumber(results.cpu.sdk)} microseconds ${formatPercent(results.cpu)}
Bandwidth:
  upload: ${formatNumber(results.upload.sdk)} bytes
  download: ${formatNumber(results.download.sdk)} bytes`
}

function formatNumber(n: number) {
  return new Intl.NumberFormat('en-US').format(n)
}

function formatPercent({ total, sdk }: ProfilingResult) {
  return `(${formatNumber((sdk / total) * 100)}%)`
}
