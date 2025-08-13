import { getGlobalObject } from './getGlobalObject'

type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never }

type XOR<T, U> = T | U extends object ? (Without<T, U> & U) | (Without<U, T> & T) : T | U

/**
 * Cached reference to the global object so it can be imported and re-used without
 * re-evaluating the heavyweight fallback logic in `getGlobalObject()`.
 */
// eslint-disable-next-line local-rules/disallow-side-effects
export const globalObject = getGlobalObject<XOR<Window, WorkerGlobalScope>>()

export const isSW = !('document' in globalObject)
