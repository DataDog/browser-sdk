import type {
  ReportType,
  BrowserWindow,
  Report,
  ReportingObserverConstructor,
  ReportingObserverOption,
} from '../../src/domain/report/browser.types'
import { noop } from '../../src/tools/utils'

export function stubReportingObserver() {
  const originalReportingObserver = (window as BrowserWindow).ReportingObserver
  let callbacks: { [k in ReportType]?: Array<(reports: Report[]) => void> } = {}

  ;(window as BrowserWindow).ReportingObserver = function (
    callback: (reports: Report[]) => void,
    { types }: ReportingObserverOption
  ) {
    types.forEach((type) => {
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
  } as unknown as ReportingObserverConstructor

  return {
    raiseReport(type: ReportType) {
      if (callbacks[type]) {
        callbacks[type]!.forEach((callback) => callback([{ ...FAKE_REPORT, type }]))
      }
    },
    reset() {
      ;(window as BrowserWindow).ReportingObserver = originalReportingObserver
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
  },
}
