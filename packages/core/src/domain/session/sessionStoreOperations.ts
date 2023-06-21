import { setTimeout } from '../../tools/timer'
import { generateUUID } from '../../tools/utils/stringUtils'
import type { SessionStoreStrategy } from './storeStrategies/sessionStoreStrategy'
import type { SessionState } from './sessionState'
import { expandSessionState, isSessionInExpiredState } from './sessionState'

type Operations = {
  process: (sessionState: SessionState) => SessionState | undefined
  after?: (sessionState: SessionState) => void
}

// We check the session every 1000ms (STORAGE_POLL_DELAY). We must keep
// (LOCK_RETRY_DELAY * LOCK_MAX_TRIES) under STORAGE_POLL_DELAY
// In case of a stale lock, (LOCK_RETRY_DELAY * LOCK_MAX_TRIES) is the minimum
// time taken by the system to reach stability.
export const LOCK_RETRY_DELAY = 10
export const LOCK_MAX_TRIES = 20

const bufferedOperations: Operations[] = []
let ongoingOperations: Operations | undefined
let currentLock: string | undefined

export function processSessionStoreOperations(
  operations: Operations,
  sessionStoreStrategy: SessionStoreStrategy,
  numberOfRetries = 0
) {
  const { retrieveSession, persistSession, clearSession, lockOptions } = sessionStoreStrategy
  // If we do not have an ongoing operation, set the received operations
  // as the current one
  if (!ongoingOperations) {
    ongoingOperations = operations
  }

  // If we have a pending ongoing operation, we should buffer the received
  // operation. It will be executed later.
  if (operations !== ongoingOperations) {
    bufferedOperations.push(operations)
    return
  }

  // Lets look into the storage if we have a session. If we do not, the
  // currentSession will be an empty object.
  let currentSession = retrieveSession()

  // If we were not able to fullfill our operation in the max amount of tries,
  // discard it. It will not be executed.
  if (lockOptions.enabled && numberOfRetries >= LOCK_MAX_TRIES) {
    next(sessionStoreStrategy)
    // However - If we cannot get a lock within a reasonable amount of time, the lock
    // may be in an inconsistent state (aborted process, manually modified, ...). We remove it.
    delete currentSession.lock
    persistSession(currentSession)
    return
  }

  if (lockOptions.enabled) {
    // If a lock has been set, and it is not ours, we want to
    // postpone the operation and retry later
    // TODO: Check that this case is properly tested
    if (currentSession.lock && currentSession.lock !== currentLock) {
      retryLater(operations, sessionStoreStrategy, numberOfRetries)
      return
    }

    // Try to acquire our lock
    if (currentSession.lock === undefined) {
      currentLock = generateUUID()
      currentSession.lock = currentLock
      persistSession(currentSession)

      // Here, typically for local storage, we must WAIT before retrieving the lock. Else, there is a chance another
      // process can unknowingly write to the storage. This happens because of a latency to replicate the written value.
      if (lockOptions.synchronizationLatency > 0) {
        retryLater(operations, sessionStoreStrategy, numberOfRetries, lockOptions.synchronizationLatency)
        return
      }

      // If there is no latency, we retrieve our session to check we're still owner of our lock.
      // If the lock has changed, postpone the operation
      currentSession = retrieveSession()
      if (currentSession.lock !== currentLock) {
        retryLater(operations, sessionStoreStrategy, numberOfRetries)
        return
      }
    }
  }

  let processedSession = operations.process(currentSession)

  if (lockOptions.enabled) {
    // If the lock has changed after process, retry later
    currentSession = retrieveSession()
    if (currentSession.lock !== currentLock) {
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
  if (lockOptions.enabled) {
    // Correctly handling lock around expiration would require to handle this case properly at several levels
    // Since we don't have evidence of lock issues around expiration, let's just not do the corruption check for it
    if (!(processedSession && isSessionInExpiredState(processedSession))) {
      // If the lock is not our own after persist, retry later
      currentSession = retrieveSession()
      if (currentSession.lock !== currentLock!) {
        retryLater(operations, sessionStoreStrategy, numberOfRetries)
        return
      }
      // Cleanup by removing lock information from the storage
      delete currentSession.lock
      persistSession(currentSession)
      processedSession = currentSession
    }
  }
  // Call after() even if session is not persisted in order to perform operations on an
  // up-to-date session state value => the value could have been modified by another tab
  operations.after?.(processedSession || currentSession)
  next(sessionStoreStrategy)
}

function retryLater(
  operations: Operations,
  sessionStore: SessionStoreStrategy,
  currentNumberOfRetries: number,
  retryDelay = LOCK_RETRY_DELAY
) {
  setTimeout(() => {
    processSessionStoreOperations(operations, sessionStore, currentNumberOfRetries + 1)
  }, retryDelay)
}

function next(sessionStore: SessionStoreStrategy) {
  ongoingOperations = undefined
  const nextOperations = bufferedOperations.shift()
  if (nextOperations) {
    processSessionStoreOperations(nextOperations, sessionStore)
  }
}
