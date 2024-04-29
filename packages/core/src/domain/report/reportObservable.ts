import { toStackTraceString } from '../../tools/stackTrace/handlingStack'
import { monitor } from '../../tools/monitor'
import { mergeObservables, Observable } from '../../tools/observable'
import { addEventListener, DOM_EVENT } from '../../browser/addEventListener'
import { includes } from '../../tools/utils/polyfills'
import { safeTruncate } from '../../tools/utils/stringUtils'
import type { Configuration } from '../configuration'
import type { ReportType, InterventionReport, DeprecationReport } from './browser.types'

export const RawReportType = {
  intervention: 'intervention',
  deprecation: 'deprecation',
  cspViolation: 'csp_violation',
} as const

export type RawReportType = (typeof RawReportType)[keyof typeof RawReportType]

export interface RawReport {
  type: RawReportType
  subtype: string
  message: string
  originalReport: SecurityPolicyViolationEvent | DeprecationReport | InterventionReport
  stack?: string
}

export function initReportObservable(configuration: Configuration, apis: RawReportType[]) {
  const observables: Array<Observable<RawReport>> = []

  if (includes(apis, RawReportType.cspViolation)) {
    observables.push(createCspViolationReportObservable(configuration))
  }

  const reportTypes = apis.filter((api: RawReportType): api is ReportType => api !== RawReportType.cspViolation)
  if (reportTypes.length) {
    observables.push(createReportObservable(reportTypes))
  }

  return mergeObservables<RawReport>(...observables)
}

function createReportObservable(reportTypes: ReportType[]) {
  return new Observable<RawReport>((observable) => {
    if (!window.ReportingObserver) {
      return
    }

    const handleReports = monitor((reports: Array<DeprecationReport | InterventionReport>, _: ReportingObserver) =>
      reports.forEach((report) => {
        observable.notify(buildRawReportFromReport(report))
      })
    ) as ReportingObserverCallback

    const observer = new window.ReportingObserver(handleReports, {
      types: reportTypes,
      buffered: true,
    })

    observer.observe()
    return () => {
      observer.disconnect()
    }
  })
}

function createCspViolationReportObservable(configuration: Configuration) {
  return new Observable<RawReport>((observable) => {
    const { stop } = addEventListener(configuration, document, DOM_EVENT.SECURITY_POLICY_VIOLATION, (event) => {
      observable.notify(buildRawReportFromCspViolation(event))
    })

    return stop
  })
}

function buildRawReportFromReport(report: DeprecationReport | InterventionReport): RawReport {
  const { type, body } = report

  return {
    type,
    subtype: body.id,
    message: `${type}: ${body.message}`,
    originalReport: report,
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
      event.originalPolicy
        ? `${message} of the policy "${safeTruncate(event.originalPolicy, 100, '...')}"`
        : 'no policy',
      event.sourceFile,
      event.lineNumber,
      event.columnNumber
    ),
    originalReport: event,
  }
}

function buildStack(
  name: string,
  message: string,
  sourceFile: string | null,
  lineNumber: number | null,
  columnNumber: number | null
): string | undefined {
  return sourceFile
    ? toStackTraceString({
        name,
        message,
        stack: [
          {
            func: '?',
            url: sourceFile,
            line: lineNumber ?? undefined,
            column: columnNumber ?? undefined,
          },
        ],
      })
    : undefined
}
