/**
 * A function that does nothing and returns `undefined`.
 *
 * Useful as a default callback, a placeholder teardown, or to explicitly ignore a promise
 * rejection (`promise.catch(noop)`), without allocating a new empty function each time.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-function
export function noop() {}
