import type { CookieOptions } from '../../browser/cookie'
import { getCookie, setCookie } from '../../browser/cookie'
import * as utils from '../../tools/utils'
import { isExperimentalFeatureEnabled } from '../configuration'
import { monitor, addMonitoringMessage } from '../internalMonitoring'
import type { SessionState } from './sessionStore'
import { SESSION_EXPIRATION_DELAY } from './sessionStore'

const SESSION_ENTRY_REGEXP = /^([a-z]+)=([a-z0-9-]+)$/
const SESSION_ENTRY_SEPARATOR = '&'

export const SESSION_COOKIE_NAME = '_dd_s'

// arbitrary values
export const LOCK_RETRY_DELAY = 10
export const MAX_NUMBER_OF_LOCK_RETRIES = 100

type Operations = {
  options: CookieOptions
  audit?: AuditBehavior
  phase?: string
  process: (cookieSession: SessionState) => SessionState | undefined
  after?: (cookieSession: SessionState) => void
}

const bufferedOperations: Operations[] = []
let ongoingOperations: Operations | undefined

export function withCookieLockAccess(operations: Operations, numberOfRetries = 0) {
  if (!ongoingOperations) {
    ongoingOperations = operations
  }
  if (operations !== ongoingOperations) {
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
  operations.audit?.addRead(`${operations.phase || ''} (1)`, currentSession)
  if (isExperimentalFeatureEnabled('cookie-lock')) {
    // if someone has lock, retry later
    if (currentSession.lock) {
      retryLater(operations, numberOfRetries)
      return
    }
    // acquire lock
    currentLock = utils.generateUUID()
    currentSession.lock = currentLock
    setSession(currentSession, operations.options)
    operations.audit?.addWrite(`${operations.phase || ''} (2)`, currentSession)
    // if lock is not acquired, retry later
    currentSession = retrieveSession()
    operations.audit?.addRead(`${operations.phase || ''} (3)`, currentSession)
    if (currentSession.lock !== currentLock) {
      retryLater(operations, numberOfRetries)
      return
    }
  }
  let processedSession = operations.process(currentSession)
  if (isExperimentalFeatureEnabled('cookie-lock')) {
    // if lock corrupted after process, retry later
    currentSession = retrieveSession()
    operations.audit?.addRead(`${operations.phase || ''} (4)`, currentSession)
    if (currentSession.lock !== currentLock!) {
      retryLater(operations, numberOfRetries)
      return
    }
  }
  if (processedSession) {
    persistSession(processedSession, operations.options)
    operations.audit?.addWrite(`${operations.phase || ''} (5)`, processedSession)
  }
  if (isExperimentalFeatureEnabled('cookie-lock')) {
    setTimeout(
      monitor(() => {
        // correctly handle lock around expiration would require to handle this case properly at several levels
        // since we don't have evidence of lock issues around expiration, let's just not do the corruption check for it
        if (!(processedSession && isExpiredState(processedSession))) {
          // if lock corrupted after persist, retry later
          currentSession = retrieveSession()
          operations.audit?.addRead(`${operations.phase || ''} (6)`, currentSession)
          if (currentSession.lock !== currentLock!) {
            retryLater(operations, numberOfRetries)
            return
          }
          delete currentSession.lock
          setSession(currentSession, operations.options)
          operations.audit?.addWrite(`${operations.phase || ''} (7)`, currentSession)
          processedSession = currentSession
        }
        after(operations, processedSession || currentSession)
      })
    )
  } else {
    after(operations, processedSession || currentSession)
  }
}

function after(operations: Operations, session: SessionState) {
  // call after even if session is not persisted in order to perform operations on
  // up-to-date cookie value, the value could have been modified by another tab
  operations.after?.(session)
  next()
}

function retryLater(operations: Operations, currentNumberOfRetries: number) {
  setTimeout(
    monitor(() => {
      withCookieLockAccess(operations, currentNumberOfRetries + 1)
    }),
    LOCK_RETRY_DELAY
  )
}

function next() {
  ongoingOperations = undefined
  const nextOperations = bufferedOperations.shift()
  if (nextOperations) {
    withCookieLockAccess(nextOperations)
  }
}

export function persistSession(session: SessionState, options: CookieOptions) {
  if (isExpiredState(session)) {
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

function isExpiredState(session: SessionState) {
  return utils.isEmptyObject(session)
}

function clearSession(options: CookieOptions) {
  setCookie(SESSION_COOKIE_NAME, '', 0, options)
}

const MAX_AUDIT_ENTRIES = 50

export interface AuditBehavior {
  addRead: Audit['addRead']
  addWrite: Audit['addWrite']
}

export class Audit {
  constructor(private productKey: string, private entries: string[]) {}

  addWrite(phase: string, session: SessionState) {
    this.addEntry(phase, 'write', session)
  }

  addRead(phase: string, session: SessionState) {
    this.addEntry(phase, 'read', session)
  }

  private addEntry(phase: string, operation: string, session: SessionState) {
    if (this.entries.length < MAX_AUDIT_ENTRIES) {
      const now = new Date()
      // hh:mm:ss.xxx in the browser timezone
      const formattedTime = `${now.toTimeString().substr(0, 8)}.${`00${now.getMilliseconds()}`.slice(-3)}`
      this.entries.push(`${formattedTime} - ${this.productKey} ${phase} ${operation} ${toSessionString(session)}`)
    }
  }
}
