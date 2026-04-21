import type {
  Pipeline,
  ConsoleResource,
  RuntimeErrorResource,
  NetworkRequestResource,
  ReportResource,
  ErrorCause,
  ContextManager,
} from '@datadog/core-next'
import { flattenCauses, extractFingerprint } from '@datadog/core-next'
import type { LogsConfig } from './configuration'

interface LogError {
  kind?: string
  stack?: string
  message?: string
  fingerprint?: string
  causes?: ErrorCause[]
}

interface LogEvent {
  date: number
  message: string
  status: string
  origin: string
  view: { url: string }
  error?: LogError
  http?: { method: string; status_code: number; url: string }
  logger?: { name: string }
  [key: string]: unknown
}

interface ActionLog {
  message: string
  status: string
  context?: object
  error?: Error
  loggerName?: string
}

interface ProcessorDependencies {
  pipeline: Pipeline<Record<string, unknown>>
  config: LogsConfig
  globalContext: ContextManager
  userContext: ContextManager
  accountContext: ContextManager
}

function startProcessor({ pipeline, config, globalContext, userContext, accountContext }: ProcessorDependencies): void {
  function process(event: Partial<LogEvent>): void {
    const accountCtx = accountContext.get()
    const hasAccount = Object.keys(accountCtx).length > 0

    const logEvent: LogEvent = {
      date: Date.now(),
      message: event.message ?? '',
      status: event.status ?? 'info',
      origin: event.origin ?? 'logger',
      view: { url: window.location.href },
      ...event,
      ...globalContext.get(),
      usr: userContext.get(),
      ...(hasAccount && { account: accountCtx }),
    }

    pipeline.publish('observation:log', logEvent)
  }

  // Subscribe to action:log (from Logger)
  pipeline.subscribe('action:log', (data: unknown) => {
    const action = data as ActionLog
    const fingerprint = extractFingerprint(action.error)
    const causes = action.error ? flattenCauses(action.error) : undefined

    process({
      message: action.message,
      status: action.status,
      origin: 'logger',
      logger: action.loggerName ? { name: action.loggerName } : undefined,
      ...(action.error && {
        error: {
          kind: action.error.name,
          stack: action.error.stack,
          message: action.error.message,
          fingerprint,
          causes,
        },
      }),
      ...(action.context as Record<string, unknown>),
    })
  })

  // Subscribe to resource:console (based on config)
  if (config.forwardConsoleLogs.length > 0) {
    pipeline.subscribe('resource:console', (data: unknown) => {
      const resource = data as ConsoleResource
      if (!config.forwardConsoleLogs.includes(resource.api as any)) return

      const statusMap: Record<string, string> = {
        log: 'info',
        debug: 'debug',
        info: 'info',
        warn: 'warn',
        error: 'error',
      }

      process({
        message: resource.message,
        status: statusMap[resource.api] ?? 'info',
        origin: 'console',
        ...(resource.error && {
          error: {
            kind: resource.error.name,
            stack: resource.stack,
            message: resource.error.message,
            fingerprint: resource.fingerprint,
            causes: resource.causes,
          },
        }),
      })
    })
  }

  // Subscribe to resource:runtime_error
  if (config.forwardErrorsToLogs) {
    pipeline.subscribe('resource:runtime_error', (data: unknown) => {
      const resource = data as RuntimeErrorResource
      process({
        message: resource.message,
        status: 'error',
        origin: 'source',
        error: {
          kind: resource.type,
          stack: resource.stack,
          message: resource.message,
          fingerprint: resource.fingerprint,
          causes: resource.causes,
        },
      })
    })
  }

  // Subscribe to resource:network_request (only error responses)
  if (config.forwardErrorsToLogs) {
    pipeline.subscribe('resource:network_request', (data: unknown) => {
      const resource = data as NetworkRequestResource
      if (resource.status !== 0 && resource.status < 400) return

      process({
        message: `${resource.method} ${resource.url} ${resource.status}`,
        status: 'error',
        origin: 'network',
        http: { method: resource.method, status_code: resource.status, url: resource.url },
        ...(resource.error && { error: { message: resource.error } }),
      })
    })
  }

  // Subscribe to resource:report
  if (config.forwardReports.length > 0) {
    pipeline.subscribe('resource:report', (data: unknown) => {
      const resource = data as ReportResource
      if (!config.forwardReports.includes(resource.type as any)) return

      process({
        message: resource.message,
        status: resource.type === 'deprecation' ? 'warn' : 'error',
        origin: 'report',
        ...(resource.stack && { error: { stack: resource.stack } }),
      })
    })
  }
}

export { startProcessor }
export type { LogEvent, LogError, ActionLog, ProcessorDependencies }
