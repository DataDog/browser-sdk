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
  networkEfficiencyGuardrails: 'network-efficiency-guardrails',
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

  const reportTypes = buildReportObserverTypes(apis)
  if (reportTypes.length) {
    observables.push(createReportObservable(reportTypes))
  }

  return mergeObservables(...observables)
}

/**
 * Maps internal RawReportType values to the browser ReportingObserver type strings.
 * `network-efficiency-guardrails` is exposed via `document-policy-violation` reports,
 * filtered by `body.featureId === 'network-efficiency-guardrails'`.
 */
function buildReportObserverTypes(apis: RawReportType[]): ReportType[] {
  const types = new Set<ReportType>()
  for (const api of apis) {
    if (api === RawReportType.cspViolation) {
      continue
    }
    if (api === RawReportType.networkEfficiencyGuardrails) {
      types.add('document-policy-violation')
    } else {
      types.add(api as ReportType)
    }
  }
  return Array.from(types)
}

function createReportObservable(reportTypes: ReportType[]) {
  return new Observable<RawReportError>((observable) => {
    if (!window.ReportingObserver) {
      return
    }

    const handleReports = monitor(
      (reports: Array<DeprecationReport | InterventionReport | DocumentPolicyViolationReport>, _: ReportingObserver) =>
        reports.forEach((report) => {
          // document-policy-violation reports are only subscribed to when
          // network-efficiency-guardrails is requested. Skip any document policy violation
          // whose featureId does not match network-efficiency-guardrails.
          if (
            report.type === 'document-policy-violation' &&
            (report.body as DocumentPolicyViolationReport['body']).featureId !==
              RawReportType.networkEfficiencyGuardrails
          ) {
            return
          }
          observable.notify(buildRawReportErrorFromReport(report))
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
  const { type, body } = report

  if (type === 'document-policy-violation') {
    const { featureId, message, disposition, sourceFile } = body as DocumentPolicyViolationReport['body']
    return buildRawReportError({
      type: featureId,
      message: `${type}: ${message}`,
      originalError: report,
      csp: { disposition },
      stack: buildStack(featureId, message, sourceFile, null, null),
    })
  }

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
