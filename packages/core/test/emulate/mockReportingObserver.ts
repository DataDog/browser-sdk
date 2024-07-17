import type { InterventionReport, ReportType } from '../../src/domain/report/browser.types'
import { noop } from '../../src/tools/utils/functionUtils'
import { createNewEvent } from './createNewEvent'

export type MockReportingObserver = ReturnType<typeof mockReportingObserver>

export function mockReportingObserver() {
  const originalReportingObserver = window.ReportingObserver
  let callbacks: { [k: string]: ReportingObserverCallback[] } = {}
  let reportingObserver: ReportingObserver

  window.ReportingObserver = function (callback: ReportingObserverCallback, { types }: ReportingObserverOptions) {
    types?.forEach((type) => {
      if (!callbacks[type]) {
        callbacks[type] = []
      }

      callbacks[type]?.push(callback)
    })

    reportingObserver = {
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
    return reportingObserver
  } as unknown as typeof originalReportingObserver

  return {
    raiseReport(type: ReportType) {
      if (callbacks[type]) {
        callbacks[type].forEach((callback) => callback([{ ...FAKE_REPORT, type }], reportingObserver))
      }
    },
    reset() {
      window.ReportingObserver = originalReportingObserver
      callbacks = {}
    },
  }
}

export type MockCspEventListener = ReturnType<typeof mockCspEventListener>

export function mockCspEventListener() {
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

export const FAKE_CSP_VIOLATION_EVENT = createNewEvent('securitypolicyviolation', {
  blockedURI: 'blob',
  columnNumber: 8,
  disposition: 'enforce',
  documentURI: 'blob',
  effectiveDirective: 'worker-src',
  lineNumber: 17,
  originalPolicy: "worker-src 'none'",
  referrer: '',
  sourceFile: 'http://foo.bar/index.js',
  statusCode: 200,
  violatedDirective: 'worker-src',
})

export const FAKE_REPORT: InterventionReport = {
  type: 'intervention',
  url: 'http://foo.bar',
  body: {
    id: 'NavigatorVibrate',
    columnNumber: 10,
    lineNumber: 20,
    message: 'foo bar',
    sourceFile: 'http://foo.bar/index.js',
    toJSON: noop,
  },
  toJSON: noop,
}
