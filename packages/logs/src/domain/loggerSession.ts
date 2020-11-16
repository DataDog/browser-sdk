import { Configuration, performDraw, startSessionManagement } from '@datadog/browser-core'

export const LOGGER_SESSION_KEY = 'logs'

export interface LoggerSession {
  getId: () => string | undefined
  isTracked: () => boolean
}

export enum LoggerTrackingType {
  NOT_TRACKED = '0',
  TRACKED = '1',
}

export function startLoggerSession(configuration: Configuration, areCookieAuthorized: boolean): LoggerSession {
  if (!areCookieAuthorized) {
    const isTracked = computeTrackingType(configuration) === LoggerTrackingType.TRACKED
    return {
      getId: () => undefined,
      isTracked: () => isTracked,
    }
  }
  const session = startSessionManagement(configuration.cookieOptions, LOGGER_SESSION_KEY, (rawTrackingType) =>
    computeSessionState(configuration, rawTrackingType)
  )
  return {
    getId: session.getId,
    isTracked: () => session.getTrackingType() === LoggerTrackingType.TRACKED,
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
