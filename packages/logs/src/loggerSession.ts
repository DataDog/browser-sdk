import { Configuration, performDraw, startSessionManagement } from '@datadog/browser-core'

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
  const session = startSessionManagement(LOGGER_COOKIE_NAME, (rawType) => computeSessionState(configuration, rawType))

  return {
    getId: session.getId,
    isTracked: () =>
      session.getType()
        ? session.getType() === LoggerSessionType.TRACKED
        : computeSessionType(configuration) === LoggerSessionType.TRACKED,
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
    type: hasValidLoggerSession(rawSessionType) ? rawSessionType : computeSessionType(configuration),
  }
}

function hasValidLoggerSession(type?: string): type is LoggerSessionType {
  return type === LoggerSessionType.NOT_TRACKED || type === LoggerSessionType.TRACKED
}
