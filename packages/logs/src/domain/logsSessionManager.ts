import { Configuration, performDraw, startSessionManager, RelativeTime } from '@datadog/browser-core'

export const LOGS_SESSION_KEY = 'logs'

export interface LogsSessionManager {
  findTrackedSession: (startTime?: RelativeTime) => LogsSession | undefined
}

export type LogsSession = {
  id?: string // session can be tracked without id
}

export enum LoggerTrackingType {
  NOT_TRACKED = '0',
  TRACKED = '1',
}

export function startLogsSessionManager(configuration: Configuration): LogsSessionManager {
  const sessionManager = startSessionManager(configuration.cookieOptions, LOGS_SESSION_KEY, (rawTrackingType) =>
    computeSessionState(configuration, rawTrackingType)
  )
  return {
    findTrackedSession: (startTime) => {
      const session = sessionManager.findActiveSession(startTime)
      return session && session.trackingType === LoggerTrackingType.TRACKED
        ? {
            id: session.id,
          }
        : undefined
    },
  }
}

export function startLogsSessionManagerStub(configuration: Configuration): LogsSessionManager {
  const isTracked = computeTrackingType(configuration) === LoggerTrackingType.TRACKED
  const session = isTracked ? {} : undefined
  return {
    findTrackedSession: () => session,
  }
}

function computeTrackingType(configuration: Configuration) {
  if (!performDraw(configuration.sampleRate)) {
    return LoggerTrackingType.NOT_TRACKED
  }
  return LoggerTrackingType.TRACKED
}

function computeSessionState(configuration: Configuration, rawSessionType?: string) {
  const trackingType = hasValidLoggerSession(rawSessionType) ? rawSessionType : computeTrackingType(configuration)
  return {
    trackingType,
    isTracked: trackingType === LoggerTrackingType.TRACKED,
  }
}

function hasValidLoggerSession(trackingType?: string): trackingType is LoggerTrackingType {
  return trackingType === LoggerTrackingType.NOT_TRACKED || trackingType === LoggerTrackingType.TRACKED
}
