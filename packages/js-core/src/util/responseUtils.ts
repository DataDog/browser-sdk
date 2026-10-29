/**
 * Returns `true` when an HTTP status code indicates a server-side error (5xx).
 *
 * Used by the retry strategy to decide whether a failed request should be retried.
 *
 * @param status - The HTTP response status code to check.
 * @returns `true` if `status` is 500 or above, `false` otherwise.
 */
export function isServerError(status: number) {
  return status >= 500
}
