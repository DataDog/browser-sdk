import { registerBridge } from '@datadog/core-next'
import type { Pipeline } from '@datadog/core-next'
import { Logger } from './domain/logger'
import type { LogsMessage } from './domain/logger'

let pipeline: Pipeline<Record<string, unknown>> | undefined
const pending: Array<{ type: string; data: unknown }> = []

function publish(type: string, data: unknown): void {
  if (pipeline) {
    pipeline.publish(type, data)
  } else {
    pending.push({ type, data })
  }
}

function handleLog(message: LogsMessage, logger: Logger): void {
  publish('action:log', {
    message: message.message,
    status: message.status,
    context: message.context,
    error: message.error,
    loggerName: logger.getName(),
  })
}

const defaultLogger = new Logger(handleLog)

const datadogLogs = {
  logger: defaultLogger,
  createLogger(name: string, config?: { handler?: string; level?: string; context?: object }): Logger {
    return new Logger(
      handleLog,
      name,
      (config?.handler as any) ?? 'http',
      (config?.level as any) ?? 'debug',
      config?.context ?? {}
    )
  },
}

registerBridge('logs', {
  connect(p: Pipeline<Record<string, unknown>>) {
    pipeline = p
    for (const event of pending) {
      pipeline.publish(event.type, event.data)
    }
    pending.length = 0
  },
})

export { datadogLogs }

// Re-export types for consumers
export { logsExtension } from './domain/configuration'
export type { LogsInitConfig, LogsConfig, ConsoleApi, ReportType } from './domain/configuration'
export { Logger, StatusType, HandlerType } from './domain/logger'
export type { LogsMessage } from './domain/logger'
export { logsModule } from './module'
export type { LogsPublicApi, LoggerConfiguration } from './processor/index'
export { startProcessor } from './domain/processor'
export type { LogEvent, LogError } from './domain/processor'
export { createRateLimiter } from './domain/rateLimiter'
