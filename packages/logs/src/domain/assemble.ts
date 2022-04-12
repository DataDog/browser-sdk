import type { Context, RawError, RelativeTime } from '@datadog/browser-core'
import { combine, createEventRateLimiter, getRelativeTime } from '@datadog/browser-core'
import type { LogsConfiguration } from './configuration'
import type { LogsMessage } from './logger'
import { StatusType } from './logger'
import type { LogsSessionManager } from './logsSessionManager'
import { reportRawError } from './reportRawError'
import type { Sender } from './sender'

export function buildAssemble(sessionManager: LogsSessionManager, configuration: LogsConfiguration, sender: Sender) {
  const reportAgentError = (error: RawError) => reportRawError(error, sender)

  const logRateLimiters = {
    [StatusType.error]: createEventRateLimiter(
      StatusType.error,
      configuration.eventRateLimiterThreshold,
      reportAgentError
    ),
    [StatusType.warn]: createEventRateLimiter(
      StatusType.warn,
      configuration.eventRateLimiterThreshold,
      reportAgentError
    ),
    [StatusType.info]: createEventRateLimiter(
      StatusType.info,
      configuration.eventRateLimiterThreshold,
      reportAgentError
    ),
    [StatusType.debug]: createEventRateLimiter(
      StatusType.debug,
      configuration.eventRateLimiterThreshold,
      reportAgentError
    ),
    ['custom']: createEventRateLimiter('custom', configuration.eventRateLimiterThreshold, reportAgentError),
  }

  return (message: LogsMessage, currentContext: Context) => {
    const startTime = message.date ? getRelativeTime(message.date) : undefined
    const session = sessionManager.findTrackedSession(startTime)

    if (!session) {
      return undefined
    }

    const contextualizedMessage = combine(
      { service: configuration.service, session_id: session.id },
      currentContext,
      getRUMInternalContext(startTime),
      message
    )

    if (
      configuration.beforeSend?.(contextualizedMessage) === false ||
      (logRateLimiters[contextualizedMessage.status] ?? logRateLimiters['custom']).isLimitReached()
    ) {
      return undefined
    }

    return contextualizedMessage as Context
  }
}

interface Rum {
  getInternalContext: (startTime?: RelativeTime) => Context
}

export function getRUMInternalContext(startTime?: RelativeTime): Context | undefined {
  const rum = (window as any).DD_RUM as Rum
  return rum && rum.getInternalContext ? rum.getInternalContext(startTime) : undefined
}
