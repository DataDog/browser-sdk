import { DOM_EVENT, addEventListener, monitor } from '@datadog/browser-core'

export interface BrowserWindow {
  ReportingObserver?: ReportingObserver
}

export interface ReportingObserver {
  disconnect(): void
  observe(): void
  takeRecords(): Report[]
}

export interface ReportingObserverOption {
  types: ReportType[]
  buffered: boolean
}

interface ReportingObserverCallback {
  (reports: Report[], observer: ReportingObserver): void
}

declare const ReportingObserver: {
  prototype: PerformanceObserver
  new (callback: ReportingObserverCallback, option: ReportingObserverOption): ReportingObserver
  readonly supportedEntryTypes: readonly string[]
}

export interface Report {
  type: ReportType
  url: string
  body: DeprecationReportBody | InterventionReportBody
}

interface DeprecationReportBody {
  id: string
  message: string
  lineNumber: number
  columnNumber: number
  sourceFile: string
  anticipatedRemoval?: Date
}

interface InterventionReportBody {
  id: string
  message: string
  lineNumber: number
  columnNumber: number
  sourceFile: string
}

export interface CspViolationReport {
  blockedURI: string
  columnNumber: number
  documentURI: string
  effectiveDirective: string
  lineNumber: number
  originalPolicy: string
  referrer: string
  sourceFile: string
  statusCode: number
  violatedDirective: string
}

type ReportType = 'intervention' | 'deprecation'

export function trackReports(reportTypes: ReportType[], callback: (message: string, report: Report) => void) {
  if ((window as BrowserWindow).ReportingObserver) {
    const handleReports = monitor((reports: Report[]) =>
      reports.forEach((report) => {
        callback(`${report.type}: ${report.body.message}`, report)
      })
    )

    const observer = new ReportingObserver(handleReports, {
      types: reportTypes,
      buffered: true,
    })

    observer.observe()

    return {
      stop: () => {
        observer.disconnect()
      },
    }
  }
}

export function trackCspViolation(callback: (message: string, report: CspViolationReport) => void) {
  const handleCspEvent = (event: SecurityPolicyViolationEvent) => {
    callback(`csp violation: ‘${event.blockedURI}’ blocked by ‘${event.effectiveDirective}’ directive`, {
      blockedURI: event.blockedURI,
      columnNumber: event.columnNumber,
      documentURI: event.documentURI,
      effectiveDirective: event.effectiveDirective,
      lineNumber: event.lineNumber,
      originalPolicy: event.originalPolicy,
      referrer: event.referrer,
      sourceFile: event.sourceFile,
      statusCode: event.statusCode,
      violatedDirective: event.violatedDirective,
    })
  }
  return addEventListener(document, DOM_EVENT.SECURITY_POLICY_VIOLATION, handleCspEvent).stop
}
