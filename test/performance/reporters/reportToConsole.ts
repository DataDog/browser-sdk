import type { Metrics } from '../profiling.type'

const DURATION_UNITS = ['μs', 'ms', 's']
const DURATION_UNITS_MS = ['ms', 's']
const BYTES_UNITS = ['B', 'kB', 'MB']
const NO_VALUE = ''

export function reportToConsole(metricsTable: Record<string, Metrics>, sdkVersion: string) {
  const report: Record<string, Record<string, string>> = {
    'memory (median)': {},
    cpu: {},
    upload: {},
    download: {},
    LCP: {},
    CLS: {},
    FCP: {},
    TTFB: {},
    INP: {},
    TBT: {},
  }

  // Populate the report with each scenario's metrics
  for (const [scenarioConfiguration, metrics] of Object.entries(metricsTable)) {
    report['memory (median)'][scenarioConfiguration] = formatNumberWithUnit(metrics.memory, BYTES_UNITS)
    report['cpu'][scenarioConfiguration] = formatNumberWithUnit(metrics.cpu, DURATION_UNITS)
    report['upload'][scenarioConfiguration] = formatNumberWithUnit(metrics.upload, BYTES_UNITS)
    report['download'][scenarioConfiguration] = formatNumberWithUnit(metrics.download, BYTES_UNITS)
    report['LCP'][scenarioConfiguration] = metrics.LCP ? formatNumberWithUnit(metrics.LCP, DURATION_UNITS_MS) : NO_VALUE
    report['CLS'][scenarioConfiguration] = metrics.CLS ? formatNumber(metrics.CLS) : NO_VALUE
    report['FCP'][scenarioConfiguration] = metrics.FCP ? formatNumberWithUnit(metrics.FCP, DURATION_UNITS_MS) : NO_VALUE
    report['TTFB'][scenarioConfiguration] = metrics.TTFB
      ? formatNumberWithUnit(metrics.TTFB, DURATION_UNITS_MS)
      : NO_VALUE
    report['INP'][scenarioConfiguration] = metrics.INP ? formatNumberWithUnit(metrics.INP, DURATION_UNITS_MS) : NO_VALUE
    report['TBT'][scenarioConfiguration] = metrics.TBT ? formatNumberWithUnit(metrics.TBT, DURATION_UNITS_MS) : NO_VALUE
  }

  console.log(`Results for SDK version: ${sdkVersion}`)
  console.table(report)
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

function formatNumber(n: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: n < 10 ? 2 : n < 100 ? 1 : 0 }).format(n)
}
