import { combine } from '../util/mergeInto'

/**
 * A typed publish/subscribe hook used to assemble SDK events.
 *
 * Multiple callbacks can be registered. When `trigger` is called, each callback receives the same
 * `params` and may return:
 * - A `Result` value — merged with the other callbacks' results via `combine`.
 * - `SKIPPED` — this callback contributes nothing; processing continues.
 * - `DISCARDED` — the entire event is dropped; no further callbacks are invoked.
 *
 * @typeParam Params - The input passed to every registered callback.
 * @typeParam Result - The type of the assembled output value.
 */
export interface Hook<Params, Result> {
  /** Registers a callback and returns a handle to unregister it. */
  register(this: void, callback: (params: Params) => Result | DISCARDED | SKIPPED): { unregister: () => void }
  /**
   * Invokes all registered callbacks with `params` and deep-merges their results.
   * Returns `DISCARDED` if any callback discards the event, or `undefined` if no callback
   * returns a result.
   */
  trigger(this: void, params: Params): Result | DISCARDED | undefined
}

/**
 * Creates a new `Hook` instance with no registered callbacks.
 *
 * @typeParam Params - The input type passed to registered callbacks.
 * @typeParam Result - The return type that callbacks contribute to.
 */
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

/** Sentinel returned by a hook callback to discard the entire event (no further callbacks are invoked). */
export const DISCARDED = 'DISCARDED'
/** Sentinel returned by a hook callback to opt out of contributing a result (other callbacks still run). */
export const SKIPPED = 'SKIPPED'

export type DISCARDED = typeof DISCARDED
export type SKIPPED = typeof SKIPPED
