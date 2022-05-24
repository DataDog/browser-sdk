import { toStackTraceString } from '../../tools/error'
import { monitor } from '../../tools/monitor'
import { mergeObservables, Observable } from '../../tools/observable'
import { DOM_EVENT, includes, addEventListener, safeTruncate } from '../../tools/utils'
import type { Report, BrowserWindow, ReportType } from './browser.types'

export const RawReportType = {
  intervention: 'intervention',
  deprecation: 'deprecation',
  cspViolation: 'csp_violation',
} as const

export type RawReportType = typeof RawReportType[keyof typeof RawReportType]

export interface RawReport {
  type: RawReportType
  subtype: string
  message: string
  stack?: string
}

export function initReportObservable(apis: RawReportType[]) {
  const observables: Array<Observable<RawReport>> = []

  if (includes(apis, RawReportType.cspViolation)) {
    observables.push(createCspViolationReportObservable())
  }

  const reportTypes = apis.filter((api: RawReportType): api is ReportType => api !== RawReportType.cspViolation)
  if (reportTypes.length) {
    observables.push(createReportObservable(reportTypes))
  }

  return mergeObservables<RawReport>(...observables)
}

function createReportObservable(reportTypes: ReportType[]) {
  const observable = new Observable<RawReport>(() => {
    if (!(window as BrowserWindow).ReportingObserver) {
      return
    }

    const handleReports = monitor((reports: Report[]) =>
      reports.forEach((report) => {
        observable.notify(buildRawReportFromReport(report))
      })
    )

    const observer = new (window as BrowserWindow).ReportingObserver!(handleReports, {
      types: reportTypes,
      buffered: true,
    })

    observer.observe()
    return () => {
      observer.disconnect()
    }
  })

  return observable
}

function createCspViolationReportObservable() {
  const observable = new Observable<RawReport>(() => {
    const handleCspViolation = monitor((event: SecurityPolicyViolationEvent) => {
      observable.notify(buildRawReportFromCspViolation(event))
    })

    const { stop } = addEventListener(document, DOM_EVENT.SECURITY_POLICY_VIOLATION, handleCspViolation)

    return stop
  })
  return observable
}

function buildRawReportFromReport({ type, body }: Report): RawReport {
  return {
    type,
    subtype: body.id,
    message: `${type}: ${body.message}`,
    stack: buildStack(body.id, body.message, body.sourceFile, body.lineNumber, body.columnNumber),
  }
}

function buildRawReportFromCspViolation(event: SecurityPolicyViolationEvent): RawReport {
  const type = RawReportType.cspViolation
  const message = `'${event.blockedURI}' blocked by '${event.effectiveDirective}' directive`
  return {
    type: RawReportType.cspViolation,
    subtype: event.effectiveDirective,
    message: `${type}: ${message}`,
    stack: buildStack(
      event.effectiveDirective,
      `${message} of the policy "${safeTruncate(event.originalPolicy, 100, '...')}"`,
      event.sourceFile,
      event.lineNumber,
      event.columnNumber
    ),
  }
}

function buildStack(
  name: string,
  message: string,
  sourceFile: string | undefined,
  lineNumber: number | undefined,
  columnNumber: number | undefined
): string | undefined {
  return (
    sourceFile &&
    toStackTraceString({
      name,
      message,
      stack: [
        {
          func: '?',
          url: sourceFile,
          line: lineNumber,
          column: columnNumber,
        },
      ],
    })
  )
}
