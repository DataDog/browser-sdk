import { clocksNow } from '@datadog/js-core/time'
import { toStackTraceString } from '../../tools/stackTrace/handlingStack'
import { monitor } from '../../tools/monitor'
import { mergeObservables, Observable } from '../../tools/observable'
import { addEventListener, DOM_EVENT, isEventSupported } from '../../browser/addEventListener'
import { safeTruncate } from '../../tools/utils/stringUtils'
import type { RawError } from '../error/error.types'
import { ErrorHandling, ErrorSource } from '../error/error.types'
import type { ReportType, InterventionReport, DeprecationReport, DocumentPolicyViolationReport } from './browser.types'

export const RawReportType = {
  intervention: 'intervention',
  deprecation: 'deprecation',
  cspViolation: 'csp_violation',
  documentPolicyViolation: 'document-policy-violation',
} as const

export type RawReportType = (typeof RawReportType)[keyof typeof RawReportType]

export type RawReportError = RawError & {
  originalError: SecurityPolicyViolationEvent | DeprecationReport | InterventionReport | DocumentPolicyViolationReport
}

export function initReportObservable(apis: RawReportType[]) {
  const observables: Array<Observable<RawReportError>> = []

  if (apis.includes(RawReportType.cspViolation)) {
    observables.push(createCspViolationReportObservable())
  }

  const reportTypes = apis.filter((api): api is ReportType => api !== RawReportType.cspViolation)
  if (reportTypes.length) {
    observables.push(createReportObservable(reportTypes))
  }

  return mergeObservables(...observables)
}

function createReportObservable(reportTypes: ReportType[]) {
  return new Observable<RawReportError>((observable) => {
    if (!window.ReportingObserver) {
      return
    }

    const handleReports = monitor(
      (reports: Array<DeprecationReport | InterventionReport | DocumentPolicyViolationReport>, _: ReportingObserver) =>
        reports.forEach((report) => observable.notify(buildRawReportErrorFromReport(report)))
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

function createCspViolationReportObservable() {
  return new Observable<RawReportError>((observable) => {
    // Salesforce does not allow to add a securitypolicyviolation event listener. https://developer.salesforce.com/tools/lws-distortion-viewer
    if (!isEventSupported(document, DOM_EVENT.SECURITY_POLICY_VIOLATION)) {
      return
    }

    const { stop } = addEventListener(document, DOM_EVENT.SECURITY_POLICY_VIOLATION, (event) => {
      observable.notify(buildRawReportErrorFromCspViolation(event))
    })

    return stop
  })
}

function buildRawReportErrorFromReport(
  report: DeprecationReport | InterventionReport | DocumentPolicyViolationReport
): RawReportError {
  if (report.type === 'document-policy-violation') {
    const { featureId, message, disposition, sourceFile } = report.body
    return buildRawReportError({
      type: featureId,
      message: `${report.type}: ${message}`,
      originalError: report,
      csp: { disposition },
      stack: buildStack(featureId, message, sourceFile, null, null),
    })
  }

  const { type, body } = report
  return buildRawReportError({
    type: body.id,
    message: `${type}: ${body.message}`,
    originalError: report,
    stack: buildStack(body.id, body.message, body.sourceFile, body.lineNumber, body.columnNumber),
  })
}

function buildRawReportErrorFromCspViolation(event: SecurityPolicyViolationEvent): RawReportError {
  const message = `'${event.blockedURI}' blocked by '${event.effectiveDirective}' directive`
  return buildRawReportError({
    type: event.effectiveDirective,
    message: `${RawReportType.cspViolation}: ${message}`,
    originalError: event,
    csp: {
      disposition: event.disposition,
    },
    stack: buildStack(
      event.effectiveDirective,
      event.originalPolicy
        ? `${message} of the policy "${safeTruncate(event.originalPolicy, 100, '...')}"`
        : 'no policy',
      event.sourceFile,
      event.lineNumber,
      event.columnNumber
    ),
  })
}

function buildRawReportError(partial: Omit<RawReportError, 'startClocks' | 'source' | 'handling'>): RawReportError {
  return {
    startClocks: clocksNow(),
    source: ErrorSource.REPORT,
    handling: ErrorHandling.UNHANDLED,
    ...partial,
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
