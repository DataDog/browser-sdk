import { Configuration } from '../core/configuration'
import {
  COOKIE_ACCESS_DELAY,
  EXPIRATION_DELAY,
  getCookie,
  SESSION_COOKIE_NAME,
  setCookie,
  trackActivity,
} from '../core/session'
import * as utils from '../core/utils'

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
  const getLoggerSession = utils.cache(() => getCookie(LOGGER_COOKIE_NAME), COOKIE_ACCESS_DELAY)
  const getSessionId = utils.cache(() => getCookie(SESSION_COOKIE_NAME), COOKIE_ACCESS_DELAY)

  const expandOrRenewSession = makeExpandOrRenewSession(configuration, getLoggerSession, getSessionId)

  expandOrRenewSession()
  trackActivity(expandOrRenewSession)

  return {
    getId: getSessionId,
    isTracked: () => getLoggerSession() === LoggerSessionType.TRACKED,
  }
}

function makeExpandOrRenewSession(
  configuration: Configuration,
  getLoggerSession: () => string | undefined,
  getSessionId: () => string | undefined
) {
  return utils.throttle(() => {
    let sessionType = getLoggerSession() as LoggerSessionType | undefined
    if (!hasValidLoggerSession(sessionType)) {
      sessionType = utils.performDraw(configuration.sampleRate)
        ? LoggerSessionType.TRACKED
        : LoggerSessionType.NOT_TRACKED
    }
    setCookie(LOGGER_COOKIE_NAME, sessionType as string, EXPIRATION_DELAY)
    if (sessionType === LoggerSessionType.TRACKED) {
      setCookie(SESSION_COOKIE_NAME, getSessionId() || utils.generateUUID(), EXPIRATION_DELAY)
    }
  }, COOKIE_ACCESS_DELAY)
}

function hasValidLoggerSession(type?: LoggerSessionType) {
  return type !== undefined && (type === LoggerSessionType.NOT_TRACKED || type === LoggerSessionType.TRACKED)
}
