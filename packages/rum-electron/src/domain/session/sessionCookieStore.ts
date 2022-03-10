import type { CookieOptions } from '../../browser/cookie'
import { getCookie, setCookie } from '../../browser/cookie'
import type { SessionState } from './sessionStore'
import { SESSION_EXPIRATION_DELAY } from './sessionStore'

const SESSION_ENTRY_REGEXP = /^([a-z]+)=([a-z0-9-]+)$/
const SESSION_ENTRY_SEPARATOR = '&'

export const SESSION_COOKIE_NAME = '_dd_s'

type Operations = {
  options: CookieOptions
  process: (cookieSession: SessionState) => SessionState | undefined
  after?: (cookieSession: SessionState) => void
}

const bufferedOperations: Operations[] = []
let ongoingOperations: Operations | undefined

export async function newCookieOperations(operations: Operations) {
  if (!ongoingOperations) {
    ongoingOperations = operations
  }
  if (operations !== ongoingOperations) {
    bufferedOperations.push(operations)
    return
  }
  const currentSession = await retrieveSession()
  const processedSession = operations.process(currentSession)
  if (processedSession) {
    await persistSession(processedSession, operations.options)
  }
  // call after even if session is not persisted in order to perform operations on
  // up-to-date cookie value, the value could have been modified by another promise
  operations.after?.(processedSession || currentSession)
  return next()
}

async function next() {
  ongoingOperations = undefined
  const nextOperations = bufferedOperations.shift()
  if (nextOperations) {
    await newCookieOperations(nextOperations)
  }
}

export async function persistSession(session: SessionState, options: CookieOptions) {
  if (isExpiredState(session)) {
    return clearSession(options)
  }
  session.expire = String(Date.now() + SESSION_EXPIRATION_DELAY)
  return setSession(session, options)
}

async function setSession(session: SessionState, options: CookieOptions) {
  return setCookie(SESSION_COOKIE_NAME, toSessionString(session), SESSION_EXPIRATION_DELAY, options)
}

export function toSessionString(session: SessionState) {
  return Object.keys(session)
    .map((key) => [key, session[key]])
    .map(([key, value]) => `${key as string}=${value as string}`)
    .join(SESSION_ENTRY_SEPARATOR)
}

export async function retrieveSession(): Promise<SessionState> {
  const sessionString = await getCookie(SESSION_COOKIE_NAME)
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
  return Object.keys(session).length === 0
}

async function clearSession(options: CookieOptions) {
  return setCookie(SESSION_COOKIE_NAME, '', 0, options)
}
