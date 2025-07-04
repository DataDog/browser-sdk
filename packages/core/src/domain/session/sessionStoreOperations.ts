import { setTimeout } from '../../tools/timer'
import { generateUUID } from '../../tools/utils/stringUtils'
import type { TimeStamp } from '../../tools/utils/timeUtils'
import { elapsed, ONE_SECOND, timeStampNow } from '../../tools/utils/timeUtils'
import { addTelemetryDebug } from '../telemetry'
import type { SessionStoreStrategy } from './storeStrategies/sessionStoreStrategy'
import type { SessionState } from './sessionState'
import { expandSessionState, isSessionInExpiredState } from './sessionState'

/**
 * Represents an operation to be performed on session state.
 *
 * The session store operations system processes these operations sequentially
 * to prevent race conditions when multiple browser tabs/windows access the same session.
 */
export interface Operations {
  /**
   * Processes the current session state and returns the new state.
   *
   * @param sessionState - The current session state from storage
   * @returns The new session state to persist, or undefined if no changes needed
   */
  process: (sessionState: SessionState) => SessionState | undefined

  /**
   * Optional callback executed after the operation completes.
   *
   * This is called even if the session wasn't persisted, allowing operations
   * on the most up-to-date session state (which could have been modified by another tab).
   *
   * @param sessionState - The final session state after the operation
   */
  after?: (sessionState: SessionState) => void
}

/**
 * Result of a session store operation.
 *
 * @deprecated Not currently used, but provides structure for future error handling
 */
export interface OperationResult {
  success: boolean
  session?: SessionState
  error?: string
  retryable?: boolean
}

/**
 * Session state with optional lock information.
 *
 * @deprecated Not currently used, but provides structure for future improvements
 */
export interface StoreWithLock {
  session: SessionState
  lock?: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Delay in milliseconds between lock acquisition retry attempts.
 *
 * This should be short enough to not block the UI but long enough to allow
 * the previous operation to complete.
 */
export const LOCK_RETRY_DELAY = 10

/**
 * Maximum number of retry attempts for lock acquisition.
 *
 * After this many retries, the operation is aborted to prevent infinite loops.
 * This protects against scenarios where locks are never released due to bugs.
 */
export const LOCK_MAX_TRIES = 100

/**
 * Maximum time a lock can be held before being considered expired.
 *
 * Locks should be held for only a few milliseconds (just the time to read/write a cookie).
 * Using one second provides a safety margin for most situations.
 */
export const LOCK_EXPIRATION_DELAY = ONE_SECOND

/**
 * Separator used in lock strings to distinguish between UUID and timestamp.
 */
export const LOCK_SEPARATOR = '--'

/**
 * Maximum number of operations that can be queued.
 *
 * This prevents memory leaks if operations are continuously added without being processed.
 */
export const MAX_QUEUE_SIZE = 50

// ============================================================================
// GLOBAL STATE
// ============================================================================

/**
 * Queue of operations waiting to be processed.
 *
 * Operations are queued when another operation is already in progress,
 * ensuring sequential access to session storage.
 */
const bufferedOperations: Operations[] = []

/**
 * Currently executing operation, if any.
 *
 * Only one operation can be processed at a time to prevent race conditions.
 */
let ongoingOperations: Operations | undefined

// ============================================================================
// MAIN OPERATION PROCESSOR
// ============================================================================

/**
 * Processes session store operations with concurrency control and lock management.
 *
 * This function ensures that only one operation can modify the session store at a time,
 * preventing race conditions when multiple browser tabs/windows access the same session.
 *
 * The function implements a queue system where:
 * 1. If no operation is running, the operation executes immediately
 * 2. If an operation is already running, the new operation is queued
 * 3. When an operation completes, the next queued operation is processed
 *
 * For lock-enabled storage strategies, the function also:
 * 1. Acquires a lock before processing
 * 2. Validates the lock hasn't been corrupted during processing
 * 3. Retries if lock acquisition fails or lock corruption is detected
 * 4. Aborts after maximum retry attempts to prevent infinite loops
 *
 * @param operations - The operation to perform on the session state
 * @param sessionStoreStrategy - Strategy for persisting/retrieving session data
 * @param numberOfRetries - Current retry attempt (used internally for lock retries)
 */
export function processSessionStoreOperations(
  operations: Operations,
  sessionStoreStrategy: SessionStoreStrategy,
  numberOfRetries = 0
) {
  const { isLockEnabled, persistSession, expireSession } = sessionStoreStrategy

  // Helper function to persist session with current lock
  const persistWithLock = (session: SessionState) => persistSession({ ...session, lock: currentLock })

  // Helper function to retrieve and parse session with lock validation
  const retrieveStore = () => {
    const { lock, ...session } = sessionStoreStrategy.retrieveSession()
    return {
      session,
      lock: lock && !isLockExpired(lock) ? lock : undefined,
    }
  }

  // ============================================================================
  // QUEUE MANAGEMENT
  // ============================================================================

  // If no operation is currently running, start this one
  if (!ongoingOperations) {
    ongoingOperations = operations
  }

  // If a different operation is running, queue this one and return
  if (operations !== ongoingOperations) {
    bufferedOperations.push(operations)
    return
  }

  // ============================================================================
  // RETRY LIMIT CHECK
  // ============================================================================

  // Abort if we've exceeded the maximum number of retry attempts
  if (isLockEnabled && numberOfRetries >= LOCK_MAX_TRIES) {
    addTelemetryDebug('Aborted session operation after max lock retries', {
      currentStore: retrieveStore(),
    })
    next(sessionStoreStrategy)
    return
  }

  // ============================================================================
  // LOCK ACQUISITION (if enabled)
  // ============================================================================

  let currentLock: string
  let currentStore = retrieveStore()

  if (isLockEnabled) {
    // If someone else has the lock, retry later
    if (currentStore.lock) {
      retryLater(operations, sessionStoreStrategy, numberOfRetries)
      return
    }

    // Attempt to acquire the lock
    currentLock = createLock()
    persistWithLock(currentStore.session)

    // Verify we actually acquired the lock (another tab might have acquired it first)
    currentStore = retrieveStore()
    if (currentStore.lock !== currentLock) {
      retryLater(operations, sessionStoreStrategy, numberOfRetries)
      return
    }
  }

  // ============================================================================
  // OPERATION PROCESSING
  // ============================================================================

  // Process the session state according to the operation
  let processedSession = operations.process(currentStore.session)

  // ============================================================================
  // LOCK VALIDATION AFTER PROCESSING
  // ============================================================================

  if (isLockEnabled) {
    // Check if our lock was corrupted during processing (another tab might have interfered)
    currentStore = retrieveStore()
    if (currentStore.lock !== currentLock!) {
      retryLater(operations, sessionStoreStrategy, numberOfRetries)
      return
    }
  }

  // ============================================================================
  // SESSION PERSISTENCE
  // ============================================================================

  if (processedSession) {
    if (isSessionInExpiredState(processedSession)) {
      // If the session is expired, clear it from storage
      expireSession(processedSession)
    } else {
      // Otherwise, expand the session state and persist it
      expandSessionState(processedSession)
      if (isLockEnabled) {
        persistWithLock(processedSession)
      } else {
        persistSession(processedSession)
      }
    }
  }

  // ============================================================================
  // FINAL LOCK VALIDATION AND CLEANUP
  // ============================================================================

  if (isLockEnabled) {
    // Note: We skip lock corruption checks for expired sessions because
    // handling lock issues around expiration would require changes at several levels.
    // Since we don't have evidence of lock issues around expiration, we avoid
    // the complexity for now.
    if (!(processedSession && isSessionInExpiredState(processedSession))) {
      // Check if our lock was corrupted after persisting
      currentStore = retrieveStore()
      if (currentStore.lock !== currentLock!) {
        retryLater(operations, sessionStoreStrategy, numberOfRetries)
        return
      }

      // If lock is still valid, restore the original session state
      // This ensures we don't lose data if another tab modified the session
      persistSession(currentStore.session)
      processedSession = currentStore.session
    }
  }

  // ============================================================================
  // COMPLETION
  // ============================================================================

  // Call the after callback with the final session state
  // This is called even if the session wasn't persisted, allowing operations
  // on the most up-to-date session state (which could have been modified by another tab)
  operations.after?.(processedSession || currentStore.session)

  // Process the next operation in the queue
  next(sessionStoreStrategy)
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Schedules a retry of the operation after a delay.
 *
 * @param operations - The operation to retry
 * @param sessionStore - The session store strategy
 * @param currentNumberOfRetries - Current retry attempt number
 */
function retryLater(operations: Operations, sessionStore: SessionStoreStrategy, currentNumberOfRetries: number) {
  setTimeout(() => {
    processSessionStoreOperations(operations, sessionStore, currentNumberOfRetries + 1)
  }, LOCK_RETRY_DELAY)
}

/**
 * Processes the next operation in the queue.
 *
 * @param sessionStore - The session store strategy
 */
function next(sessionStore: SessionStoreStrategy) {
  ongoingOperations = undefined
  const nextOperations = bufferedOperations.shift()
  if (nextOperations) {
    processSessionStoreOperations(nextOperations, sessionStore)
  }
}

/**
 * Creates a unique lock identifier.
 *
 * The lock consists of a UUID and a timestamp, separated by LOCK_SEPARATOR.
 * This allows us to detect expired locks and ensure uniqueness.
 *
 * @returns A unique lock string
 */
export function createLock(): string {
  return generateUUID() + LOCK_SEPARATOR + timeStampNow()
}

/**
 * Checks if a lock has expired.
 *
 * A lock is considered expired if:
 * 1. It doesn't contain a timestamp (malformed)
 * 2. The time since the lock was created exceeds LOCK_EXPIRATION_DELAY
 *
 * @param lock - The lock string to check
 * @returns true if the lock has expired, false otherwise
 */
function isLockExpired(lock: string) {
  const [, timeStamp] = lock.split(LOCK_SEPARATOR)
  return !timeStamp || elapsed(Number(timeStamp) as TimeStamp, timeStampNow()) > LOCK_EXPIRATION_DELAY
}
