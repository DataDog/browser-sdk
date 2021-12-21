import { CookieOptions, getCookie, setCookie } from '../../browser/cookie'
import * as utils from '../../tools/utils'
import { isExperimentalFeatureEnabled } from '../configuration/experimentalFeatures'
import { monitor, addMonitoringMessage } from '../internalMonitoring/internalMonitoring'
import { SessionState, SESSION_EXPIRATION_DELAY } from './sessionStore'

const SESSION_ENTRY_REGEXP = /^([a-z]+)=([a-z0-9-]+)$/
const SESSION_ENTRY_SEPARATOR = '&'

export const SESSION_COOKIE_NAME = '_dd_s'

// arbitrary values
export const LOCK_RETRY_DELAY = 10
export const MAX_NUMBER_OF_LOCK_RETRIES = 50

type Operations = {
  options: CookieOptions
  process: (cookieSession: SessionState) => SessionState | undefined
  after?: (cookieSession: SessionState) => void
}

const bufferedOperations: Operations[] = []
let onGoingOperations: Operations | undefined

export function withCookieLockAccess(operations: Operations, numberOfRetries = 0) {
  if (!onGoingOperations) {
    onGoingOperations = operations
  }
  if (operations !== onGoingOperations) {
    bufferedOperations.push(operations)
    return
  }
  if (numberOfRetries >= MAX_NUMBER_OF_LOCK_RETRIES) {
    addMonitoringMessage('Reach max lock retry')
    next()
    return
  }
  let currentLock: string
  let currentSession = retrieveSession()
  if (isExperimentalFeatureEnabled('cookie-lock')) {
    // if someone has lock, postpone
    if (currentSession.lock) {
      postpone(operations, numberOfRetries)
      return
    }
    // acquire lock
    currentLock = utils.generateUUID()
    currentSession.lock = currentLock
    setSession(currentSession, operations.options)
    // if lock is not acquired, postpone
    currentSession = retrieveSession()
    if (currentSession.lock !== currentLock) {
      postpone(operations, numberOfRetries)
      return
    }
  }
  let processedSession = operations.process(currentSession)
  if (isExperimentalFeatureEnabled('cookie-lock')) {
    // if lock corrupted after process, postpone
    currentSession = retrieveSession()
    if (currentSession.lock !== currentLock!) {
      postpone(operations, numberOfRetries)
      return
    }
  }
  if (processedSession) {
    persistSession(processedSession, operations.options)
  }
  if (isExperimentalFeatureEnabled('cookie-lock')) {
    if (!processedSession || !utils.isEmptyObject(processedSession)) {
      // if lock corrupted after persist, postpone
      currentSession = retrieveSession()
      if (currentSession.lock !== currentLock!) {
        postpone(operations, numberOfRetries)
        return
      }
      delete currentSession.lock
      setSession(currentSession, operations.options)
      processedSession = currentSession
    }
  }
  operations.after?.(processedSession || currentSession)
  next()
}

function postpone(operations: Operations, currentNumberOfRetries: number) {
  setTimeout(
    monitor(() => {
      withCookieLockAccess(operations, currentNumberOfRetries + 1)
    }),
    LOCK_RETRY_DELAY
  )
}

function next() {
  onGoingOperations = bufferedOperations.shift()
  if (onGoingOperations) {
    withCookieLockAccess(onGoingOperations)
  }
}

export function persistSession(session: SessionState, options: CookieOptions) {
  if (utils.isEmptyObject(session)) {
    clearSession(options)
    return
  }
  session.expire = String(Date.now() + SESSION_EXPIRATION_DELAY)
  setSession(session, options)
}

function setSession(session: SessionState, options: CookieOptions) {
  setCookie(SESSION_COOKIE_NAME, toSessionString(session), SESSION_EXPIRATION_DELAY, options)
}

export function toSessionString(session: SessionState) {
  return utils
    .objectEntries(session)
    .map(([key, value]) => `${key}=${value as string}`)
    .join(SESSION_ENTRY_SEPARATOR)
}

export function retrieveSession(): SessionState {
  const sessionString = getCookie(SESSION_COOKIE_NAME)
  const session: SessionState = {}
  if (isValidSessionString(sessionString)) {
    sessionString.split(SESSION_ENTRY_SEPARATOR).forEach((entry) => {
      const matches = SESSION_ENTRY_REGEXP.exec(entry)
      if (matches !== null) {
        const [, key, value] = matches
        session[key] = value
      }
    })
  }
  return session
}

function isValidSessionString(sessionString: string | undefined): sessionString is string {
  return (
    sessionString !== undefined &&
    (sessionString.indexOf(SESSION_ENTRY_SEPARATOR) !== -1 || SESSION_ENTRY_REGEXP.test(sessionString))
  )
}

function clearSession(options: CookieOptions) {
  setCookie(SESSION_COOKIE_NAME, '', 0, options)
}
