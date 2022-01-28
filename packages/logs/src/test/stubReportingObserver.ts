import { noop } from '@datadog/browser-core'
import type { BrowserWindow, Report, ReportingObserver } from '../domain/trackReports'

export function stubReportingObserver() {
  const originalReportingObserver = (window as BrowserWindow).ReportingObserver

  let callbacks: Array<(reports: Report[]) => void> = []
  function raiseReport() {
    callbacks.forEach((callback) => callback([FAKE_REPORT]))
  }

  ;(window as BrowserWindow).ReportingObserver = function (callback: (reports: Report[]) => void) {
    callbacks.push(callback)
    return {
      disconnect() {
        noop()
      },
      observe() {
        noop()
      },
      takeRecords() {
        noop()
      },
    }
  } as unknown as ReportingObserver

  return {
    raiseReport,
    reset() {
      ;(window as BrowserWindow).ReportingObserver = originalReportingObserver
      callbacks = []
    },
  }
}

export const FAKE_REPORT: Report = {
  type: 'intervention',
  url: 'http://foo.bar',
  body: {
    id: 'report',
    columnNumber: 10,
    lineNumber: 20,
    message: 'message',
    sourceFile: 'http://foo.bar/index.js',
  },
}
