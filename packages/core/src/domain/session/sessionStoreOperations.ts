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

export async function processSessionStoreOperations(
  operations: Operations,
  sessionStoreStrategy: SessionStoreStrategy,
  numberOfRetries = 0
) {
  await navigator.locks.request('session_store', { ifAvailable: true }, async (currentLock) => {
    const { isLockEnabled, persistSession, expireSession } = sessionStoreStrategy

    if (!ongoingOperations) {
      ongoingOperations = operations
    }
    if (operations !== ongoingOperations) {
      bufferedOperations.push(operations)
      return
    }

    if (isLockEnabled && numberOfRetries >= LOCK_MAX_TRIES) {
      await next(sessionStoreStrategy)
      return
    }

    let session = sessionStoreStrategy.retrieveSession()
    if (isLockEnabled) {
      // if someone has lock, retry later
      if (!currentLock) {
        await retryLater(operations, sessionStoreStrategy, numberOfRetries)
        return
      }
    }
    let processedSession = operations.process(session)

    if (processedSession) {
      if (isSessionInExpiredState(processedSession)) {
        expireSession()
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
        session = sessionStoreStrategy.retrieveSession()
        persistSession(session)
        processedSession = session
      }
    }
    // call after even if session is not persisted in order to perform operations on
    // up-to-date session state value => the value could have been modified by another tab
    operations.after?.(processedSession || session)
    await next(sessionStoreStrategy)
  })
}

async function retryLater(operations: Operations, sessionStore: SessionStoreStrategy, currentNumberOfRetries: number) {
  // setTimeout(() => {
  await processSessionStoreOperations(operations, sessionStore, currentNumberOfRetries + 1)
  // }, LOCK_RETRY_DELAY)
}

async function next(sessionStore: SessionStoreStrategy) {
  ongoingOperations = undefined
  const nextOperations = bufferedOperations.shift()
  if (nextOperations) {
    await processSessionStoreOperations(nextOperations, sessionStore)
  }
}
