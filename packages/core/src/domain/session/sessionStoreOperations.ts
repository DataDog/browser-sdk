import { setTimeout } from '../../tools/timer'
import { generateUUID } from '../../tools/utils/stringUtils'
import type { SessionStoreStrategy } from './storeStrategies/sessionStoreStrategy'
import type { SessionState } from './sessionState'
import { expandSessionState, isSessionInExpiredState } from './sessionState'

type Operations = {
  process: (sessionState: SessionState) => SessionState | undefined
  after?: (sessionState: SessionState) => void
}

export const LOCK_RETRY_DELAY = 10
export const LOCK_MAX_TRIES = 100
const bufferedOperations: Operations[] = []
let ongoingOperations: Operations | undefined

export function processSessionStoreOperations(
  operations: Operations,
  sessionStoreStrategy: SessionStoreStrategy,
  numberOfRetries = 0
) {
  const { isLockEnabled, retrieveSession, persistSession, clearSession } = sessionStoreStrategy

  if (!ongoingOperations) {
    ongoingOperations = operations
  }
  if (operations !== ongoingOperations) {
    bufferedOperations.push(operations)
    return
  }
  if (isLockEnabled && numberOfRetries >= LOCK_MAX_TRIES) {
    next(sessionStoreStrategy)
    return
  }
  let currentLock: string
  let currentSession = retrieveSession()
  if (isLockEnabled) {
    // if someone has lock, retry later
    if (currentSession.lock) {
      retryLater(operations, sessionStoreStrategy, numberOfRetries)
      return
    }
    // acquire lock
    currentLock = generateUUID()
    currentSession.lock = currentLock
    persistSession(currentSession)
    // if lock is not acquired, retry later
    currentSession = retrieveSession()
    if (currentSession.lock !== currentLock) {
      retryLater(operations, sessionStoreStrategy, numberOfRetries)
      return
    }
  }
  let processedSession = operations.process(currentSession)
  if (isLockEnabled) {
    // if lock corrupted after process, retry later
    currentSession = retrieveSession()
    if (currentSession.lock !== currentLock!) {
      retryLater(operations, sessionStoreStrategy, numberOfRetries)
      return
    }
  }
  if (processedSession) {
    if (isSessionInExpiredState(processedSession)) {
      clearSession()
    } else {
      expandSessionState(processedSession)
      persistSession(processedSession)
    }
  }
  if (isLockEnabled) {
    // correctly handle lock around expiration would require to handle this case properly at several levels
    // since we don't have evidence of lock issues around expiration, let's just not do the corruption check for it
    if (!(processedSession && isSessionInExpiredState(processedSession))) {
      // if lock corrupted after persist, retry later
      currentSession = retrieveSession()
      if (currentSession.lock !== currentLock!) {
        retryLater(operations, sessionStoreStrategy, numberOfRetries)
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
  next(sessionStoreStrategy)
}

function retryLater(operations: Operations, sessionStore: SessionStoreStrategy, currentNumberOfRetries: number) {
  setTimeout(() => {
    processSessionStoreOperations(operations, sessionStore, currentNumberOfRetries + 1)
  }, LOCK_RETRY_DELAY)
}

function next(sessionStore: SessionStoreStrategy) {
  ongoingOperations = undefined
  const nextOperations = bufferedOperations.shift()
  if (nextOperations) {
    processSessionStoreOperations(nextOperations, sessionStore)
  }
}
