export function isServerError(status: number) {
  return status >= 500
}

export function tryToClone(response: Response): Response | undefined {
  try {
    return response.clone()
  } catch (e) {
    // clone can throw if the response has already been used by another instrumentation or is disturbed
    return
  }
}
