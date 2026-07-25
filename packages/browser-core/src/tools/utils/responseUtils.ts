export { isServerError } from '@datadog/js-core/util'

export function tryToClone(response: Response): Response | undefined {
  try {
    return response.clone()
  } catch {
    // clone can throw if the response has already been used by another instrumentation or is disturbed
    return
  }
}
