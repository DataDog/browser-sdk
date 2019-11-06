import { Configuration, initSession, performDraw } from '@browser-agent/core'

export const LOGGER_COOKIE_NAME = '_dd_l'

export interface LoggerSession {
  getId: () => string | undefined
  isTracked: () => boolean
}

export enum LoggerSessionType {
  NOT_TRACKED = '0',
  TRACKED = '1',
}

export function startLoggerSession(configuration: Configuration): LoggerSession {
  const session = initSession(LOGGER_COOKIE_NAME, (rawType) => getSessionTypeInfo(configuration, rawType))

  return {
    getId: session.getId,
    isTracked: () => session.getType() === LoggerSessionType.TRACKED,
  }
}

function getSessionTypeInfo(configuration: Configuration, rawSessionType?: string) {
  let sessionType
  if (hasValidLoggerSession(rawSessionType)) {
    sessionType = rawSessionType
  } else if (!performDraw(configuration.sampleRate)) {
    sessionType = LoggerSessionType.NOT_TRACKED
  } else {
    sessionType = LoggerSessionType.TRACKED
  }
  return {
    isTracked: sessionType === LoggerSessionType.TRACKED,
    type: sessionType,
  }
}

function hasValidLoggerSession(type?: string): type is LoggerSessionType {
  return type === LoggerSessionType.NOT_TRACKED || type === LoggerSessionType.TRACKED
}
