/**
 * Returns the current time as a Unix timestamp in milliseconds.
 *
 * Prefer this over `Date.now()` because some environments incorrectly polyfill `Date.now` —
 * for example, old versions of `datejs` patched it to return a `Date` instance instead of a
 * number, which silently breaks arithmetic. `new Date().getTime()` is unaffected by such patches.
 *
 * @returns Current Unix timestamp in milliseconds.
 */
export function dateNow(): number {
  return new Date().getTime()
}
