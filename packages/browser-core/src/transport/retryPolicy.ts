/** A policy controlling how HTTP requests are retried when delivery fails. */
export const enum RetryPolicy {
  /**
   * Retry a network error only while offline, since a request sent online may have been
   * delivered successfully despite the browser reporting a spurious error.
   */
  MINIMIZE_DUPLICATES,

  /**
   * Always retry in response to network errors to maximize the likelihood of successful
   * delivery.
   *
   * Behaves like MINIMIZE_DUPLICATES until we've received at least one response from the
   * endpoint, to prevent infinite retries if e.g. an ad blocker is active or a proxy
   * which does not supply CORS headers is in use.
   */
  MINIMIZE_DATA_LOSS,
}
