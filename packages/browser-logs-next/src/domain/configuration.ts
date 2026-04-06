import type { Extension } from '@datadog/core-next'

type ConsoleApi = 'log' | 'debug' | 'info' | 'warn' | 'error'
type ReportType = 'deprecation' | 'intervention' | 'csp-violation'

interface LogsInitConfig {
  beforeSend?: (event: Record<string, unknown>) => boolean | void
  forwardErrorsToLogs?: boolean
  forwardConsoleLogs?: ConsoleApi[] | 'all'
  forwardReports?: ReportType[] | 'all'
}

interface LogsConfig {
  beforeSend?: (event: Record<string, unknown>) => boolean | void
  forwardErrorsToLogs: boolean
  forwardConsoleLogs: ConsoleApi[]
  forwardReports: ReportType[]
}

const ALL_CONSOLE_APIS: ConsoleApi[] = ['log', 'debug', 'info', 'warn', 'error']
const ALL_REPORT_TYPES: ReportType[] = ['deprecation', 'intervention', 'csp-violation']

const logsExtension: Extension<'logs', LogsInitConfig, LogsConfig> = {
  key: 'logs',
  validate(init: LogsInitConfig | undefined): LogsConfig | null {
    if (!init) {
      return null
    }

    let forwardConsoleLogs: ConsoleApi[]
    if (init.forwardConsoleLogs === 'all') {
      forwardConsoleLogs = [...ALL_CONSOLE_APIS]
    } else if (Array.isArray(init.forwardConsoleLogs)) {
      // Validate each entry is a known ConsoleApi
      const valid = init.forwardConsoleLogs.every((api) => ALL_CONSOLE_APIS.includes(api))
      if (!valid) {
        console.warn('Invalid forwardConsoleLogs value')
        return null
      }
      forwardConsoleLogs = init.forwardConsoleLogs
    } else {
      forwardConsoleLogs = []
    }

    let forwardReports: ReportType[]
    if (init.forwardReports === 'all') {
      forwardReports = [...ALL_REPORT_TYPES]
    } else if (Array.isArray(init.forwardReports)) {
      forwardReports = init.forwardReports
    } else {
      forwardReports = []
    }

    return {
      beforeSend: init.beforeSend,
      forwardErrorsToLogs: init.forwardErrorsToLogs ?? true,
      forwardConsoleLogs,
      forwardReports,
    }
  },
}

export { logsExtension, ALL_CONSOLE_APIS, ALL_REPORT_TYPES }
export type { LogsInitConfig, LogsConfig, ConsoleApi, ReportType }
