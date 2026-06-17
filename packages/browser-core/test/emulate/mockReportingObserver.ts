import type {
  DocumentPolicyViolationReport,
  InterventionReport,
  ReportType,
} from '../../src/domain/report/browser.types'
import { noop } from '../../src/tools/utils/functionUtils'
import { registerCleanupTask } from '../registerCleanupTask'
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

  registerCleanupTask(() => {
    window.ReportingObserver = originalReportingObserver
    callbacks = {}
  })

  return {
    raiseReport(type: ReportType, overrides?: Partial<DocumentPolicyViolationReport>) {
      if (callbacks[type]) {
        const report =
          type === 'document-policy-violation'
            ? { ...FAKE_DOCUMENT_POLICY_VIOLATION_REPORT, ...overrides }
            : { ...FAKE_REPORT, type }
        callbacks[type].forEach((callback) => callback([report], reportingObserver))
      }
    },
  }
}

export type MockCspEventListener = ReturnType<typeof mockCspEventListener>

export function mockCspEventListener() {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalAddEventListener = EventTarget.prototype.addEventListener
  EventTarget.prototype.addEventListener = jasmine
    .createSpy()
    .and.callFake((_type: string, listener: EventListener) => {
      listeners.push(listener)
    })

  registerCleanupTask(() => {
    EventTarget.prototype.addEventListener = originalAddEventListener
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

export const FAKE_DOCUMENT_POLICY_VIOLATION_REPORT: DocumentPolicyViolationReport = {
  type: 'document-policy-violation',
  url: 'http://foo.bar',
  body: {
    featureId: 'network-efficiency-guardrails',
    message: 'Document policy violation: resource compression is required.',
    disposition: 'report',
    lineNumber: null,
    columnNumber: null,
    sourceFile: 'https://foo.bar/large-uncompressed.js',
    toJSON: noop,
  },
  toJSON: noop,
}

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
