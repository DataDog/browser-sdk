import type { ProfilingResult, ProfilingResults } from './profiling.types'

const DURATION_UNITS = ['μs', 'ms', 's']

const BYTES_UNITS = ['B', 'kB', 'MB']

export function formatProfilingResults(results: ProfilingResults) {
  const hostsMaxWidth = Math.max(...results.upload.map(({ host }) => host.length))

  const memorySize = formatNumberWithUnit(results.memory.sdk, BYTES_UNITS)
  const memoryPercent = formatPercent(results.memory)
  const cpuTime = formatNumberWithUnit(results.cpu.sdk, DURATION_UNITS)
  const cpuPercent = formatPercent(results.cpu)
  const uploadSize = formatNumberWithUnit(
    results.upload.reduce((total, { requestsSize }) => total + requestsSize, 0),
    BYTES_UNITS
  )
  const uploadDetails = results.upload.map(
    ({ host, requestsSize, requestsCount }) =>
      `* ${host.padEnd(hostsMaxWidth, ' ')} ${formatNumberWithUnit(requestsSize, BYTES_UNITS)} (${formatNumber(
        requestsCount
      )} requests)`
  )
  const downloadSize = formatNumberWithUnit(results.download, BYTES_UNITS)

  return `\
**Memory** (median): ${memorySize} ${memoryPercent}

**CPU**: ${cpuTime} ${cpuPercent}

**Bandwidth**:

  * upload: ${uploadSize}
    ${uploadDetails.join('\n    ')}

  * download: ${downloadSize}
`
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
