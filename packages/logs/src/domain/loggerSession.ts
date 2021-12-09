import { Configuration, performDraw, startSessionManagement, RelativeTime } from '@datadog/browser-core'

export const LOGGER_SESSION_KEY = 'logs'

export interface LoggerSession {
  getId: (startTime?: RelativeTime) => string | undefined
  isTracked: (startTime?: RelativeTime) => boolean
}

export enum LoggerTrackingType {
  NOT_TRACKED = '0',
  TRACKED = '1',
}

export function startLoggerSession(configuration: Configuration): LoggerSession {
  const session = startSessionManagement(configuration.cookieOptions, LOGGER_SESSION_KEY, (rawTrackingType) =>
    computeSessionState(configuration, rawTrackingType)
  )
  return {
    getId: session.getId,
    isTracked: (startTime) => session.getTrackingType(startTime) === LoggerTrackingType.TRACKED,
  }
}

export function startLoggerSessionStub(configuration: Configuration) {
  const isTracked = computeTrackingType(configuration) === LoggerTrackingType.TRACKED
  return {
    getId: () => undefined,
    isTracked: () => isTracked,
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
