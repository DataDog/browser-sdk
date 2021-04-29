import { ProfilingResult, ProfilingResults } from './types'

const DURATION_UNITS = ['μs', 'ms', 's']

const BYTES_UNITS = ['B', 'kB', 'MB']

export function formatProfilingResults(results: ProfilingResults) {
  const hostsMaxWidth = Math.max(...results.upload.map(({ host }) => host.length))
  const typeMaxWidth = Math.max(...results.download.appByType.map(({ type }) => type.length))

  const memorySize = formatNumberWithUnit(results.memory.sdk, BYTES_UNITS)
  const memoryPercent = formatPercent(results.memory)
  const cpuTime = formatNumberWithUnit(results.cpu.sdk, DURATION_UNITS)
  const cpuPercent = formatPercent(results.cpu)
  const uploadSize = formatNumberWithUnit(
    results.upload.reduce((total, { requestsSize }) => total + requestsSize, 0),
    BYTES_UNITS
  )
  const uploadDetails = results.upload.map((requestStatsForHost) => {
    const host = requestStatsForHost.host.padEnd(hostsMaxWidth, ' ')
    const requestsSize = formatNumberWithUnit(requestStatsForHost.requestsSize, BYTES_UNITS)
    const requestsCount = formatNumber(requestStatsForHost.requestsCount)
    return `* ${host} ${requestsSize} (${requestsCount} requests)`
  })

  const appDownloadDetails = results.download.appByType.map((responseStatsByType) => {
    const type = responseStatsByType.type.padEnd(typeMaxWidth, ' ')
    const responsesSize = formatNumberWithUnit(responseStatsByType.responsesSize, BYTES_UNITS)
    return `* ${type} ${responsesSize}`
  })
  const downloadSize = formatNumberWithUnit(results.download.sdk, BYTES_UNITS)

  return `\
**Memory** (median): ${memorySize} ${memoryPercent}

**CPU**: ${cpuTime} ${cpuPercent}

**Bandwidth**:

  * upload by the SDK: ${uploadSize}
    ${uploadDetails.join('\n    ')}

  * download by the SDK: ${downloadSize}

  * download by the app:
    ${appDownloadDetails.join('\n    ')}
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
