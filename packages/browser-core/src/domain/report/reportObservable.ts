import { clocksNow } from '@datadog/js-core/time'
import { toStackTraceString } from '../../tools/stackTrace/handlingStack'
import { monitor } from '../../tools/monitor'
import { mergeObservables, Observable } from '../../tools/observable'
import { addEventListener, DOM_EVENT, isEventSupported } from '../../browser/addEventListener'
import { safeTruncate } from '../../tools/utils/stringUtils'
import type { RawError } from '../error/error.types'
import { ErrorHandling, ErrorSource } from '../error/error.types'
import { buildDebugIdByUrl } from '../sourceCodeContext'
import type { ReportType, InterventionReport, DeprecationReport } from './browser.types'

export const RawReportType = {
  intervention: 'intervention',
  deprecation: 'deprecation',
  cspViolation: 'csp_violation',
} as const

export type RawReportType = (typeof RawReportType)[keyof typeof RawReportType]

export type RawReportError = RawError & {
  originalError: SecurityPolicyViolationEvent | DeprecationReport | InterventionReport
}

export function initReportObservable(apis: RawReportType[]) {
  const observables: Array<Observable<RawReportError>> = []

  if (apis.includes(RawReportType.cspViolation)) {
    observables.push(createCspViolationReportObservable())
  }

  const reportTypes = apis.filter((api: RawReportType): api is ReportType => api !== RawReportType.cspViolation)
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

    const handleReports = monitor((reports: Array<DeprecationReport | InterventionReport>, _: ReportingObserver) =>
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

/**
 * The single frame every report kind boils down to. Reports don't carry a real stack, but they all
 * point at a source file, so this is what both the stack trace and the debug ids are derived from.
 */
interface ReportSourceLocation {
  message: string
  sourceFile: string | null
  lineNumber: number | null
  columnNumber: number | null
}

function buildRawReportErrorFromReport(report: DeprecationReport | InterventionReport): RawReportError {
  const { type, body } = report

  return buildRawReportError(
    {
      type: body.id,
      message: `${type}: ${body.message}`,
      originalError: report,
    },
    {
      message: body.message,
      sourceFile: body.sourceFile,
      lineNumber: body.lineNumber,
      columnNumber: body.columnNumber,
    }
  )
}

function buildRawReportErrorFromCspViolation(event: SecurityPolicyViolationEvent): RawReportError {
  const message = `'${event.blockedURI}' blocked by '${event.effectiveDirective}' directive`
  return buildRawReportError(
    {
      type: event.effectiveDirective,
      message: `${RawReportType.cspViolation}: ${message}`,
      originalError: event,
      csp: {
        disposition: event.disposition,
      },
    },
    {
      message: event.originalPolicy
        ? `${message} of the policy "${safeTruncate(event.originalPolicy, 100, '...')}"`
        : 'no policy',
      sourceFile: event.sourceFile,
      lineNumber: event.lineNumber,
      columnNumber: event.columnNumber,
    }
  )
}

function buildRawReportError(
  partial: Omit<RawReportError, 'startClocks' | 'source' | 'handling' | 'stack' | 'debugIds' | 'type'> & {
    type: string
  },
  location: ReportSourceLocation
): RawReportError {
  return {
    startClocks: clocksNow(),
    source: ErrorSource.REPORT,
    handling: ErrorHandling.UNHANDLED,
    ...partial,
    stack: buildStack(partial.type, location),
    debugIds: location.sourceFile ? buildDebugIdByUrl([location.sourceFile]) : undefined,
  }
}

function buildStack(
  name: string,
  { message, sourceFile, lineNumber, columnNumber }: ReportSourceLocation
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
