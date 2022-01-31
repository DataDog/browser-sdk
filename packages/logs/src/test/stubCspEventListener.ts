export function stubCspEventListener() {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalAddEventListener = document.addEventListener
  const listeners: EventListener[] = []

  document.addEventListener = function (_type: string, listener: EventListener) {
    listeners.push(listener)
  }

  return {
    dispatchEvent() {
      listeners.forEach((listener) => listener(FAKE_CSP_VIOLATION_EVENT))
    },
    reset() {
      document.addEventListener = originalAddEventListener
    },
  }
}

export const FAKE_CSP_VIOLATION_EVENT = {
  blockedURI: 'blob',
  columnNumber: 8,
  documentURI: 'blob',
  effectiveDirective: 'worker-src',
  lineNumber: 17,
  originalPolicy: "worker-src 'none'",
  referrer: '',
  sourceFile: 'http://foo.bar/index.js',
  statusCode: 200,
  violatedDirective: 'worker-src',
} as SecurityPolicyViolationEvent
