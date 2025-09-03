import { setTimeout } from '../../tools/timer'
import { generateUUID } from '../../tools/utils/stringUtils'
import type { TimeStamp } from '../../tools/utils/timeUtils'
import { elapsed, ONE_SECOND, timeStampNow } from '../../tools/utils/timeUtils'
import { addTelemetryDebug } from '../telemetry'
import type { SessionStoreStrategy } from './storeStrategies/sessionStoreStrategy'
import type { SessionState } from './sessionState'
import { expandSessionState, isSessionInExpiredState } from './sessionState'

interface Operations {
  process: (sessionState: SessionState) => SessionState | undefined
  after?: (sessionState: SessionState) => void
}

export const LOCK_RETRY_DELAY = 10
export const LOCK_MAX_TRIES = 10

// Locks should be hold for a few milliseconds top, just the time it takes to read and write a
// cookie. Using one second should be enough in most situations.
export const LOCK_EXPIRATION_DELAY = ONE_SECOND
const LOCK_SEPARATOR = '--'

const bufferedOperations: Operations[] = []
let ongoingOperations: Operations | undefined

export function processSessionStoreOperations(
  operations: Operations,
  sessionStoreStrategy: SessionStoreStrategy,
  numberOfRetries = 0,
  retryable = false
) {
  const { isLockEnabled, persistSession, expireSession } = sessionStoreStrategy
  // @ts-ignore
  window.log('TRY', numberOfRetries, '-'.repeat(60))
  // @ts-ignore
  window.log({ isLockEnabled, persistSession, expireSession })
  // @ts-ignore
  window.log('-'.repeat(80))
  const persistWithLock = (session: SessionState) => persistSession({ ...session, lock: currentLock })
  const retrieveStore = () => {
    const { lock, ...session } = sessionStoreStrategy.retrieveSession(retryable)
    // @ts-ignore
    window.log('retrieveStoreINNER', lock, session)

    return {
      session,
      lock: lock && !isLockExpired(lock) ? lock : undefined,
    }
  }

  if (!ongoingOperations) {
    ongoingOperations = operations
  }
  if (operations !== ongoingOperations) {
    bufferedOperations.push(operations)
    return
  }
  if (isLockEnabled && numberOfRetries >= LOCK_MAX_TRIES) {
    addTelemetryDebug('Aborted session operation after max lock retries', {
      currentStore: retrieveStore(),
    })
    next(sessionStoreStrategy)
    return
  }
  let currentLock: string
  let currentStore = retrieveStore()
  // @ts-ignore
  window.log('retrieveStore:ONE', currentStore)

  if (isLockEnabled) {
    // if someone has lock, retry later
    if (currentStore.lock) {
      // @ts-ignore
      window.log('retryLater:ONE', currentStore)
      retryLater(operations, sessionStoreStrategy, numberOfRetries)
      return
    }
    // acquire lock
    currentLock = createLock()
    // @ts-ignore
    window.log('persistWithLock:ONE', currentLock)
    persistWithLock(currentStore.session)
    // if lock is not acquired, retry later
    // @ts-ignore
    window.log('retrieveStore:TWO', currentStore)
    currentStore = retrieveStore()
    if (currentStore.lock !== currentLock) {
      // @ts-ignore
      window.log('retryLater:TWO', currentStore)
      retryLater(operations, sessionStoreStrategy, numberOfRetries)
      return
    }
  }
  // @ts-ignore
  window.log('process:ONE', currentStore)
  let processedSession = operations.process(currentStore.session)
  if (isLockEnabled) {
    // if lock corrupted after process, retry later
    // @ts-ignore
    window.log('retrieveStore:THREE', currentStore)
    currentStore = retrieveStore()
    if (currentStore.lock !== currentLock!) {
      // @ts-ignore
      window.log('retryLater:THREE', currentStore)
      retryLater(operations, sessionStoreStrategy, numberOfRetries)
      return
    }
  }
  if (processedSession) {
    if (isSessionInExpiredState(processedSession)) {
      // @ts-ignore
      window.log('expireSession:ONE', currentStore)
      expireSession(processedSession)
    } else {
      // @ts-ignore
      window.log('expandSessionState:ONE', currentStore)
      expandSessionState(processedSession)
      if (isLockEnabled) {
        // @ts-ignore
        window.log('persistWithLock:TWO', currentStore)
        persistWithLock(processedSession)
      } else {
        persistSession(processedSession)
      }
    }
  }
  if (isLockEnabled) {
    // correctly handle lock around expiration would require to handle this case properly at several levels
    // since we don't have evidence of lock issues around expiration, let's just not do the corruption check for it
    if (!(processedSession && isSessionInExpiredState(processedSession))) {
      // if lock corrupted after persist, retry later
      // @ts-ignore
      window.log('retrieveStore:FOUR', currentStore)
      currentStore = retrieveStore()
      if (currentStore.lock !== currentLock!) {
        // @ts-ignore
        window.log('retryLater:FOUR', currentStore)
        retryLater(operations, sessionStoreStrategy, numberOfRetries)
        return
      }
      // @ts-ignore
      window.log('persist:ONE', currentStore)
      persistSession(currentStore.session)
      processedSession = currentStore.session
    }
  }
  // call after even if session is not persisted in order to perform operations on
  // up-to-date session state value => the value could have been modified by another tab
  // @ts-ignore
  window.log('after', processedSession || currentStore.session)
  operations.after?.(processedSession || currentStore.session)
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

export function createLock(): string {
  return generateUUID() + LOCK_SEPARATOR + timeStampNow()
}

function isLockExpired(lock: string) {
  const [, timeStamp] = lock.split(LOCK_SEPARATOR)
  return !timeStamp || elapsed(Number(timeStamp) as TimeStamp, timeStampNow()) > LOCK_EXPIRATION_DELAY
}
