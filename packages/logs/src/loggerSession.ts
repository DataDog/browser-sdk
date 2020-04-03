import { Configuration, performDraw, startSessionManagement } from '@datadog/browser-core'

export const LOGGER_OLD_COOKIE_NAME = '_dd_l'
export const LOGGER_SESSION_KEY = 'logs'

export interface LoggerSession {
  getId: () => string | undefined
  isTracked: () => boolean
}

export enum LoggerSessionType {
  NOT_TRACKED = '0',
  TRACKED = '1',
}

export function startLoggerSession(configuration: Configuration, areCookieAuthorized: boolean): LoggerSession {
  if (!areCookieAuthorized) {
    const isTracked = computeSessionType(configuration) === LoggerSessionType.TRACKED
    return {
      getId: () => undefined,
      isTracked: () => isTracked,
    }
  }
  const session = startSessionManagement(LOGGER_SESSION_KEY, LOGGER_OLD_COOKIE_NAME, (rawType) =>
    computeSessionState(configuration, rawType)
  )
  return {
    getId: session.getId,
    isTracked: () => session.getType() === LoggerSessionType.TRACKED,
  }
}

function computeSessionType(configuration: Configuration): string {
  if (!performDraw(configuration.sampleRate)) {
    return LoggerSessionType.NOT_TRACKED
  }
  return LoggerSessionType.TRACKED
}

function computeSessionState(configuration: Configuration, rawSessionType?: string) {
  const sessionType = hasValidLoggerSession(rawSessionType) ? rawSessionType : computeSessionType(configuration)
  return {
    isTracked: sessionType === LoggerSessionType.TRACKED,
    type: sessionType,
  }
}

function hasValidLoggerSession(type?: string): type is LoggerSessionType {
  return type === LoggerSessionType.NOT_TRACKED || type === LoggerSessionType.TRACKED
}
