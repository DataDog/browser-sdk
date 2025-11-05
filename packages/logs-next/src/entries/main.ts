import { getInternalApi, MessageType } from '@datadog/browser-internal-next'
import { Logger } from '@datadog/browser-logs/internal'
import type { LoggerConfiguration } from '@datadog/browser-logs'

export function createLogger(name: string, conf?: LoggerConfiguration): Logger {
  return new Logger(
    (logsMessage, logger, handlingStack) => {
      getInternalApi().notify({
        type: MessageType.LOGS_MESSAGE,
        message: logsMessage,
        logger,
        handlingStack,
      })
    },
    name, // TODO sanitize in lazy
    conf?.handler,
    conf?.level,
    conf?.context
  )
}
