import { LOCK_NAME } from '../src/domain/session/sessionStoreOperations'
import { noop } from '../src/tools/utils/functionUtils'

export function wait(durationMs: number = 0): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })
}

export function waitNextMicrotask(): Promise<void> {
  return Promise.resolve()
}

export function waitSessionOperations(): Promise<void> {
  return navigator.locks.request(LOCK_NAME, noop)
}
