import type { Module, ModuleContext } from '@datadog/core-next'
import { logsExtension } from '../domain/configuration'
import type { LogsConfig } from '../domain/configuration'
import { Logger } from '../domain/logger'
import type { LogsMessage } from '../domain/logger'
import { startProcessor } from '../domain/processor'
import { rateLimitEnricher } from '../domain/rateLimitEnricher'

interface LoggerConfiguration {
  level?: string
  handler?: string | string[]
  context?: object
}

interface LogsPublicApi extends Record<string, unknown> {
  logger: Logger
  createLogger(name: string, config?: LoggerConfiguration): Logger
  getLogger(name: string): Logger | undefined
}

const logsProcessor: Module = {
  name: 'logs',
  extension: logsExtension,
  init(context: ModuleContext): LogsPublicApi {
    const config = (context.config as any).logs as LogsConfig
    const loggers = new Map<string, Logger>()

    function handleLog(message: LogsMessage, logger: Logger) {
      context.pipeline.publish('action:log', {
        message: message.message,
        status: message.status,
        context: message.context,
        error: message.error,
        loggerName: logger.getName(),
      })
    }

    const defaultLogger = new Logger(handleLog)
    loggers.set('default', defaultLogger)

    // Register log-specific enrichers on observation:log
    context.pipeline.enrich('observation:log', rateLimitEnricher())

    // Start the processor (subscribes to resources, transforms to observations)
    startProcessor({
      pipeline: context.pipeline,
      config,
    })

    return {
      logger: defaultLogger,

      createLogger(name: string, loggerConfig?: LoggerConfiguration): Logger {
        const logger = new Logger(
          handleLog,
          name,
          (loggerConfig?.handler as any) ?? 'http',
          (loggerConfig?.level as any) ?? 'debug',
          loggerConfig?.context ?? {}
        )
        loggers.set(name, logger)
        return logger
      },

      getLogger(name: string): Logger | undefined {
        return loggers.get(name)
      },
    }
  },
}

export { logsProcessor }
export type { LogsPublicApi, LoggerConfiguration }
