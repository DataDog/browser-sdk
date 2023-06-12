import type { ReportType } from '../../src/domain/report/browser.types'
import { noop } from '../../src/tools/utils/functionUtils'

export function stubReportingObserver() {
  const originalReportingObserver = window.ReportingObserver
  let callbacks: { [k: string]: ReportingObserverCallback[] } = {}

  window.ReportingObserver = function (callback: ReportingObserverCallback, { types }: ReportingObserverOptions) {
    types?.forEach((type) => {
      if (!callbacks[type]) {
        callbacks[type] = []
      }

      callbacks[type]?.push(callback)
    })

    return {
      disconnect() {
        noop()
      },
      observe() {
        noop()
      },
      takeRecords() {
        return []
      },
    }
  } as unknown as typeof originalReportingObserver

  return {
    raiseReport(type: ReportType) {
      if (callbacks[type]) {
        callbacks[type].forEach((callback) => callback([{ ...FAKE_REPORT, type }], null!))
      }
    },
    reset() {
      window.ReportingObserver = originalReportingObserver
      callbacks = {}
    },
  }
}

export function stubCspEventListener() {
  spyOn(document, 'addEventListener').and.callFake((_type: string, listener: EventListener) => {
    listeners.push(listener)
  })

  const listeners: EventListener[] = []

  return {
    dispatchEvent() {
      listeners.forEach((listener) => listener(FAKE_CSP_VIOLATION_EVENT))
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

export const FAKE_REPORT: Report = {
  type: 'intervention',
  url: 'http://foo.bar',
  body: {
    id: 'NavigatorVibrate',
    columnNumber: 10,
    lineNumber: 20,
    message: 'foo bar',
    sourceFile: 'http://foo.bar/index.js',
  } as unknown as ReportBody,
  toJSON: noop,
}
