import { setTimeout } from '../../tools/timer'
import { dateNow } from '../../tools/utils/timeUtils'
import { generateUUID } from '../../tools/utils/stringUtils'
import { isChromium } from '../../tools/utils/browserDetection'
import { SESSION_EXPIRATION_DELAY } from './sessionConstants'
import type { SessionState, SessionStore } from './sessionStore'
import { isSessionInExpiredState } from './sessionStore'

type Operations = {
  process: (sessionState: SessionState) => SessionState | undefined
  after?: (sessionState: SessionState) => void
}

export const LOCK_RETRY_DELAY = 10
export const LOCK_MAX_TRIES = 100
const bufferedOperations: Operations[] = []
let ongoingOperations: Operations | undefined

export function processSessionStoreOperations(operations: Operations, sessionStore: SessionStore, numberOfRetries = 0) {
  const { retrieveSession, persistSession, clearSession } = sessionStore
  const lockEnabled = isLockEnabled()

  if (!ongoingOperations) {
    ongoingOperations = operations
  }
  if (operations !== ongoingOperations) {
    bufferedOperations.push(operations)
    return
  }
  if (lockEnabled && numberOfRetries >= LOCK_MAX_TRIES) {
    next(sessionStore)
    return
  }
  let currentLock: string
  let currentSession = retrieveSession()
  if (lockEnabled) {
    // if someone has lock, retry later
    if (currentSession.lock) {
      retryLater(operations, sessionStore, numberOfRetries)
      return
    }
    // acquire lock
    currentLock = generateUUID()
    currentSession.lock = currentLock
    persistSession(currentSession)
    // if lock is not acquired, retry later
    currentSession = retrieveSession()
    if (currentSession.lock !== currentLock) {
      retryLater(operations, sessionStore, numberOfRetries)
      return
    }
  }
  let processedSession = operations.process(currentSession)
  if (lockEnabled) {
    // if lock corrupted after process, retry later
    currentSession = retrieveSession()
    if (currentSession.lock !== currentLock!) {
      retryLater(operations, sessionStore, numberOfRetries)
      return
    }
  }
  if (processedSession) {
    if (isSessionInExpiredState(processedSession)) {
      clearSession()
    } else {
      processedSession.expire = String(dateNow() + SESSION_EXPIRATION_DELAY)
      persistSession(processedSession)
    }
  }
  if (lockEnabled) {
    // correctly handle lock around expiration would require to handle this case properly at several levels
    // since we don't have evidence of lock issues around expiration, let's just not do the corruption check for it
    if (!(processedSession && isSessionInExpiredState(processedSession))) {
      // if lock corrupted after persist, retry later
      currentSession = retrieveSession()
      if (currentSession.lock !== currentLock!) {
        retryLater(operations, sessionStore, numberOfRetries)
        return
      }
      delete currentSession.lock
      persistSession(currentSession)
      processedSession = currentSession
    }
  }
  // call after even if session is not persisted in order to perform operations on
  // up-to-date session state value => the value could have been modified by another tab
  operations.after?.(processedSession || currentSession)
  next(sessionStore)
}

/**
 * Lock strategy allows mitigating issues due to concurrent access to cookie.
 * This issue concerns only chromium browsers and enabling this on firefox increases cookie write failures.
 */
export const isLockEnabled = () => isChromium()

function retryLater(operations: Operations, sessionStore: SessionStore, currentNumberOfRetries: number) {
  setTimeout(() => {
    processSessionStoreOperations(operations, sessionStore, currentNumberOfRetries + 1)
  }, LOCK_RETRY_DELAY)
}

function next(sessionStore: SessionStore) {
  ongoingOperations = undefined
  const nextOperations = bufferedOperations.shift()
  if (nextOperations) {
    processSessionStoreOperations(nextOperations, sessionStore)
  }
}
