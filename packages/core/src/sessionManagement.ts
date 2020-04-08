import { cacheCookieAccess, COOKIE_ACCESS_DELAY, CookieCache } from './cookie'
import { monitor } from './internalMonitoring'
import { Observable } from './observable'
import { tryOldCookiesMigration } from './oldCookiesMigration'
import * as utils from './utils'

export const SESSION_COOKIE_NAME = '_dd_s'
export const SESSION_EXPIRATION_DELAY = 15 * utils.ONE_MINUTE
export const SESSION_TIME_OUT_DELAY = 4 * utils.ONE_HOUR
export const VISIBILITY_CHECK_DELAY = utils.ONE_MINUTE

export interface Session<T> {
  renewObservable: Observable<void>
  getId(): string | undefined
  getType(): T | undefined
}

export interface SessionState {
  id?: string
  created?: string
  expire?: string
  [key: string]: string | undefined
}

/**
 * Limit access to cookie to avoid performance issues
 */
export function startSessionManagement<Type extends string>(
  sessionTypeKey: string,
  computeSessionState: (rawType?: string) => { type: Type; isTracked: boolean },
  withNewSessionStrategy = false,
  visibilityStateProvider = () => document.visibilityState
): Session<Type> {
  const sessionCookie = cacheCookieAccess(SESSION_COOKIE_NAME)
  tryOldCookiesMigration(sessionCookie)
  const renewObservable = new Observable<void>()
  let currentSessionId = retrieveActiveSession(sessionCookie, withNewSessionStrategy).id

  const expandOrRenewSession = utils.throttle(() => {
    const session = retrieveActiveSession(sessionCookie, withNewSessionStrategy)
    const { type, isTracked } = computeSessionState(session[sessionTypeKey])
    session[sessionTypeKey] = type
    if (isTracked && !session.id) {
      session.id = utils.generateUUID()
      if (withNewSessionStrategy) {
        session.created = String(Date.now())
      }
    }
    // save changes and expand session duration
    persistSession(session, sessionCookie, withNewSessionStrategy)

    // If the session id has changed, notify that the session has been renewed
    if (isTracked && currentSessionId !== session.id) {
      currentSessionId = session.id
      renewObservable.notify()
    }
  }, COOKIE_ACCESS_DELAY)

  const expandSession = () => {
    const session = retrieveActiveSession(sessionCookie, withNewSessionStrategy)
    persistSession(session, sessionCookie, withNewSessionStrategy)
  }

  expandOrRenewSession()
  trackActivity(expandOrRenewSession)
  if (withNewSessionStrategy) {
    trackVisibility(expandSession, visibilityStateProvider)
  }

  return {
    getId() {
      return retrieveActiveSession(sessionCookie, withNewSessionStrategy).id
    },
    getType() {
      return retrieveActiveSession(sessionCookie, withNewSessionStrategy)[sessionTypeKey] as Type | undefined
    },
    renewObservable,
  }
}

const SESSION_ENTRY_REGEXP = /^([a-z]+)=([a-z0-9-]+)$/

const SESSION_ENTRY_SEPARATOR = '&'

export function isValidSessionString(sessionString: string | undefined): sessionString is string {
  return (
    sessionString !== undefined &&
    (sessionString.indexOf(SESSION_ENTRY_SEPARATOR) !== -1 || SESSION_ENTRY_REGEXP.test(sessionString))
  )
}

function retrieveActiveSession(sessionCookie: CookieCache, withNewSessionStrategy: boolean): SessionState {
  const session = retrieveSession(sessionCookie)
  if (!withNewSessionStrategy || isActiveSession(session)) {
    return session
  }
  // clear session
  const inactiveSession = {}
  persistSession(inactiveSession, sessionCookie, withNewSessionStrategy)
  return inactiveSession
}

function isActiveSession(session: SessionState) {
  // created and expire can be undefined for versions which was not storing them
  // these checks could be removed when older versions will not be available/live anymore
  return (
    (session.created === undefined || Date.now() - Number(session.created) < SESSION_TIME_OUT_DELAY) &&
    (session.expire === undefined || Date.now() < Number(session.expire))
  )
}

function retrieveSession(sessionCookie: CookieCache): SessionState {
  const sessionString = sessionCookie.get()
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

export function persistSession(session: SessionState, cookie: CookieCache, withNewSessionStrategy = false) {
  if (utils.isEmptyObject(session)) {
    // clear session
    cookie.set('', 0)
    return
  }
  if (withNewSessionStrategy) {
    session.expire = String(Date.now() + SESSION_EXPIRATION_DELAY)
  }
  const cookieString = utils
    .objectEntries(session)
    .map(([key, value]) => `${key}=${value}`)
    .join(SESSION_ENTRY_SEPARATOR)
  cookie.set(cookieString, SESSION_EXPIRATION_DELAY)
}

export function stopSessionManagement() {
  registeredListeners.forEach((e) => e())
  registeredIntervals.forEach((interval) => clearInterval(interval))
  registeredListeners = []
  registeredIntervals = []
}

let registeredListeners: Array<() => void> = []
let registeredIntervals: number[] = []

export function trackActivity(expandOrRenewSession: () => void) {
  const doExpandOrRenewSession = monitor(expandOrRenewSession)
  const options = { capture: true, passive: true }
  ;[utils.DOM_EVENT.CLICK, utils.DOM_EVENT.TOUCH_START, utils.DOM_EVENT.KEY_DOWN, utils.DOM_EVENT.SCROLL].forEach(
    (event: string) => {
      document.addEventListener(event, doExpandOrRenewSession, options)
      registeredListeners.push(() => document.removeEventListener(event, doExpandOrRenewSession, options))
    }
  )
}

function trackVisibility(expandSession: () => void, visibilityStateProvider: () => VisibilityState) {
  const expandSessionWhenVisible = monitor(() => {
    if (visibilityStateProvider() === 'visible') {
      expandSession()
    }
  })

  const visibilityCheckInterval = window.setInterval(expandSessionWhenVisible, VISIBILITY_CHECK_DELAY)
  document.addEventListener(utils.DOM_EVENT.VISIBILITY_CHANGE, expandSessionWhenVisible)

  registeredIntervals.push(visibilityCheckInterval)
  registeredListeners.push(() =>
    document.removeEventListener(utils.DOM_EVENT.VISIBILITY_CHANGE, expandSessionWhenVisible)
  )
}
