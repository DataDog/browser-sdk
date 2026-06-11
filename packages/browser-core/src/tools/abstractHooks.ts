import { combine } from './mergeInto'

export interface Hook<Params, Result> {
  register(this: void, callback: (params: Params) => Result | DISCARDED | SKIPPED): { unregister: () => void }
  trigger(this: void, params: Params): Result | DISCARDED | undefined
}

export function createHook<Params, Result>(): Hook<Params, Result> {
  type Callback = (params: Params) => Result | DISCARDED | SKIPPED
  let callbacks: Callback[] = []

  return {
    register(callback) {
      callbacks.push(callback)
      return {
        unregister() {
          callbacks = callbacks.filter((cb) => cb !== callback)
        },
      }
    },
    trigger(params) {
      const results: Result[] = []
      for (const callback of callbacks) {
        const result = callback(params)
        if (result === DISCARDED) {
          return DISCARDED
        }
        if (result === SKIPPED) {
          continue
        }
        results.push(result)
      }
      return combine(...(results as [unknown, unknown])) as Result
    },
  }
}

export type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer U>
    ? Array<RecursivePartial<U>>
    : T[P] extends object | undefined
      ? RecursivePartial<T[P]>
      : T[P]
}

// Discards the event from being sent
export const DISCARDED = 'DISCARDED'
// Skips from the assembly of the event
export const SKIPPED = 'SKIPPED'

export type DISCARDED = typeof DISCARDED
export type SKIPPED = typeof SKIPPED
