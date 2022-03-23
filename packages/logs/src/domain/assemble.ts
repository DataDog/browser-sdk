import type { Context, RawError, RelativeTime } from '@datadog/browser-core'
import { combine, createEventRateLimiter, getRelativeTime } from '@datadog/browser-core'
import type { LogsConfiguration } from './configuration'
import type { LogsMessage } from './logger'
import { StatusType } from './logger'
import type { LogsSessionManager } from './logsSessionManager'

export function buildAssemble(
  sessionManager: LogsSessionManager,
  configuration: LogsConfiguration,
  reportRawError: (error: RawError) => void
) {
  const logRateLimiters = {
    [StatusType.error]: createEventRateLimiter(
      StatusType.error,
      configuration.eventRateLimiterThreshold,
      reportRawError
    ),
    [StatusType.warn]: createEventRateLimiter(StatusType.warn, configuration.eventRateLimiterThreshold, reportRawError),
    [StatusType.info]: createEventRateLimiter(StatusType.info, configuration.eventRateLimiterThreshold, reportRawError),
    [StatusType.debug]: createEventRateLimiter(
      StatusType.debug,
      configuration.eventRateLimiterThreshold,
      reportRawError
    ),
    ['custom']: createEventRateLimiter('custom', configuration.eventRateLimiterThreshold, reportRawError),
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
