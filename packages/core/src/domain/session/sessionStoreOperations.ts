import type { SessionStoreStrategy } from './storeStrategies/sessionStoreStrategy'
import type { SessionState } from './sessionState'
import { expandSessionState, isSessionInExpiredState } from './sessionState'

export interface Operations {
  process: (sessionState: SessionState) => SessionState | undefined
  after?: (sessionState: SessionState) => void
}

const WEB_LOCKS_NAME = 'dd_session'

let operationQueue: Array<{
  operations: Operations
  sessionStoreStrategy: SessionStoreStrategy
}> = []
let isProcessing = false

export function resetSessionStoreOperations() {
  operationQueue = []
  isProcessing = false
}

export function processSessionStoreOperations(operations: Operations, sessionStoreStrategy: SessionStoreStrategy) {
  const { isLockEnabled } = sessionStoreStrategy
  const useWebLocks = isLockEnabled && 'locks' in navigator

  if (useWebLocks) {
    // Use Web Locks API - queue operations to process asynchronously
    operationQueue.push({ operations, sessionStoreStrategy })
    processNextOperation()
  } else {
    // No lock needed - execute synchronously for backwards compatibility
    executeOperations(operations, sessionStoreStrategy)
  }
}

function processNextOperation() {
  if (isProcessing || operationQueue.length === 0) {
    return
  }

  isProcessing = true
  const { operations, sessionStoreStrategy } = operationQueue.shift()!

  void navigator.locks.request(WEB_LOCKS_NAME, { mode: 'exclusive' }, () => {
    executeOperations(operations, sessionStoreStrategy)
    isProcessing = false
    processNextOperation()
  })
}

function executeOperations(operations: Operations, sessionStoreStrategy: SessionStoreStrategy) {
  const { persistSession, expireSession, retrieveSession } = sessionStoreStrategy

  // Remove any existing lock field from the retrieved session (backwards compatibility)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { lock, ...session } = retrieveSession()

  const processedSession = operations.process(session)

  if (processedSession) {
    if (isSessionInExpiredState(processedSession)) {
      expireSession(processedSession)
    } else {
      expandSessionState(processedSession)
      persistSession(processedSession)
    }
  }

  // Call after even if session is not persisted in order to perform operations on
  // up-to-date session state value => the value could have been modified by another tab
  operations.after?.(processedSession || session)
}
