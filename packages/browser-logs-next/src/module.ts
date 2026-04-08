import type { Module, ModuleContext } from '@datadog/core-next'
import { ContextManager } from '@datadog/core-next'
import { logsExtension } from './domain/configuration'
import type { LogsConfig } from './domain/configuration'
import { Logger } from './domain/logger'
import type { LogsMessage } from './domain/logger'
import { startProcessor } from './domain/processor'
import { beforeSendEnricher } from './domain/beforeSendEnricher'
import { rateLimitEnricher } from './domain/rateLimitEnricher'

interface LoggerConfiguration {
  level?: string
  handler?: string | string[]
  context?: object
}

interface LogsPublicApi extends Record<string, unknown> {
  logger: Logger
  createLogger(name: string, config?: LoggerConfiguration): Logger
  getLogger(name: string): Logger | undefined
  setGlobalContext(context: object): void
  getGlobalContext(): Record<string, unknown>
  setGlobalContextProperty(key: string, value: unknown): void
  removeGlobalContextProperty(key: string): void
  clearGlobalContext(): void
  setUser(user: object): void
  getUser(): Record<string, unknown>
  setUserProperty(key: string, value: unknown): void
  removeUserProperty(key: string): void
  clearUser(): void
  setAccount(account: object): void
  getAccount(): Record<string, unknown>
  setAccountProperty(key: string, value: unknown): void
  removeAccountProperty(key: string): void
  clearAccount(): void
}

const logsModule: Module = {
  name: 'logs',
  extension: logsExtension,
  init(context: ModuleContext): LogsPublicApi {
    const config = (context.config as any).logs as LogsConfig
    const globalContext = new ContextManager()
    const userContext = new ContextManager()
    const accountContext = new ContextManager()
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
    if (config.beforeSend) {
      context.pipeline.enrich('observation:log', beforeSendEnricher(config.beforeSend))
    }
    context.pipeline.enrich('observation:log', rateLimitEnricher())

    // Start the processor (subscribes to resources, transforms to observations)
    startProcessor({
      pipeline: context.pipeline,
      config,
      globalContext,
      userContext,
      accountContext,
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

      setGlobalContext(ctx: object) {
        globalContext.set(ctx as Record<string, unknown>)
      },
      getGlobalContext() {
        return globalContext.get()
      },
      setGlobalContextProperty(key: string, value: unknown) {
        globalContext.setProperty(key as never, value as never)
      },
      removeGlobalContextProperty(key: string) {
        globalContext.removeProperty(key as never)
      },
      clearGlobalContext() {
        globalContext.clear()
      },

      setUser(user: object) {
        userContext.set(user as Record<string, unknown>)
      },
      getUser() {
        return userContext.get()
      },
      setUserProperty(key: string, value: unknown) {
        userContext.setProperty(key as never, value as never)
      },
      removeUserProperty(key: string) {
        userContext.removeProperty(key as never)
      },
      clearUser() {
        userContext.clear()
      },

      setAccount(account: object) {
        accountContext.set(account as Record<string, unknown>)
      },
      getAccount() {
        return accountContext.get()
      },
      setAccountProperty(key: string, value: unknown) {
        accountContext.setProperty(key as never, value as never)
      },
      removeAccountProperty(key: string) {
        accountContext.removeProperty(key as never)
      },
      clearAccount() {
        accountContext.clear()
      },
    }
  },
}

export { logsModule }
export type { LogsPublicApi, LoggerConfiguration }
