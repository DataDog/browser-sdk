import type {
  Pipeline,
  ConsoleResource,
  RuntimeErrorResource,
  NetworkRequestResource,
  ReportResource,
  ContextManager,
} from '@datadog/core-next'
import type { LogsConfig } from './configuration'
import { createRateLimiter } from './rateLimiter'

interface LogEvent {
  date: number
  message: string
  status: string
  origin: string
  view: { url: string }
  error?: { kind?: string; stack?: string; message?: string }
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

interface AssemblyDependencies {
  pipeline: Pipeline<Record<string, unknown>>
  config: LogsConfig
  globalContext: ContextManager
  userContext: ContextManager
}

function startAssembly({ pipeline, config, globalContext, userContext }: AssemblyDependencies): void {
  const rateLimiter = createRateLimiter()

  function assembleAndPublish(event: Partial<LogEvent>): void {
    const logEvent: LogEvent = {
      date: Date.now(),
      message: event.message ?? '',
      status: event.status ?? 'info',
      origin: event.origin ?? 'logger',
      view: { url: window.location.href },
      ...event,
      ...globalContext.get(),
      usr: userContext.get(),
    }

    // Apply beforeSend
    if (config.beforeSend) {
      const result = config.beforeSend(logEvent)
      if (result === false) return
    }

    // Apply rate limiting
    if (rateLimiter.isLimitReached(logEvent.status)) return

    pipeline.publish('observation:log', logEvent)
  }

  // Subscribe to action:log (from Logger)
  pipeline.subscribe('action:log', (data: unknown) => {
    const action = data as ActionLog
    assembleAndPublish({
      message: action.message,
      status: action.status,
      origin: 'logger',
      logger: action.loggerName ? { name: action.loggerName } : undefined,
      ...(action.error && {
        error: { kind: action.error.name, stack: action.error.stack, message: action.error.message },
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

      assembleAndPublish({
        message: resource.message,
        status: statusMap[resource.api] ?? 'info',
        origin: 'console',
        ...(resource.error && {
          error: { kind: resource.error.name, stack: resource.stack, message: resource.error.message },
        }),
      })
    })
  }

  // Subscribe to resource:runtime_error
  if (config.forwardErrorsToLogs) {
    pipeline.subscribe('resource:runtime_error', (data: unknown) => {
      const resource = data as RuntimeErrorResource
      assembleAndPublish({
        message: resource.message,
        status: 'error',
        origin: 'source',
        error: { kind: resource.type, stack: resource.stack, message: resource.message },
      })
    })
  }

  // Subscribe to resource:network_request (only error responses)
  if (config.forwardErrorsToLogs) {
    pipeline.subscribe('resource:network_request', (data: unknown) => {
      const resource = data as NetworkRequestResource
      // Only forward errors: status 0 (network failure) or >= 400
      if (resource.status !== 0 && resource.status < 400) return

      assembleAndPublish({
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

      assembleAndPublish({
        message: resource.message,
        status: resource.type === 'deprecation' ? 'warn' : 'error',
        origin: 'report',
        ...(resource.stack && { error: { stack: resource.stack } }),
      })
    })
  }
}

export { startAssembly }
export type { LogEvent, ActionLog, AssemblyDependencies }
