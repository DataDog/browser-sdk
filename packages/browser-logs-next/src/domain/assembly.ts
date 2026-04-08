import type {
  Pipeline,
  ConsoleResource,
  RuntimeErrorResource,
  NetworkRequestResource,
  ReportResource,
  ErrorCause,
  ContextManager,
} from '@datadog/core-next'
import type { LogsConfig } from './configuration'
import { createRateLimiter } from './rateLimiter'

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

interface AssemblyDependencies {
  pipeline: Pipeline<Record<string, unknown>>
  config: LogsConfig
  globalContext: ContextManager
  userContext: ContextManager
  accountContext: ContextManager
}

function extractFingerprint(error: Error | undefined): string | undefined {
  if (!error) return undefined
  return (error as any).dd_fingerprint ? String((error as any).dd_fingerprint) : undefined
}

function extractCauses(error: Error | undefined): ErrorCause[] | undefined {
  if (!error || !('cause' in error)) return undefined

  const causes: ErrorCause[] = []
  let current: unknown = error.cause
  while (current instanceof Error) {
    causes.push({
      message: current.message,
      type: current.name,
      stack: current.stack,
    })
    current = (current as any).cause
  }

  return causes.length > 0 ? causes : undefined
}

function startAssembly({ pipeline, config, globalContext, userContext, accountContext }: AssemblyDependencies): void {
  const rateLimiter = createRateLimiter()

  function assembleAndPublish(event: Partial<LogEvent>): void {
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

    if (config.beforeSend) {
      const result = config.beforeSend(logEvent)
      if (result === false) return
    }

    if (rateLimiter.isLimitReached(logEvent.status)) return

    pipeline.publish('observation:log', logEvent)
  }

  // Subscribe to action:log (from Logger)
  pipeline.subscribe('action:log', (data: unknown) => {
    const action = data as ActionLog
    const fingerprint = extractFingerprint(action.error)
    const causes = extractCauses(action.error)

    assembleAndPublish({
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

      assembleAndPublish({
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
      assembleAndPublish({
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
export type { LogEvent, LogError, ActionLog, AssemblyDependencies }
