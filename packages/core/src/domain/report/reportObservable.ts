import { toStackTraceString } from '../../tools/error'
import { mergeObservables, Observable } from '../../tools/observable'
import { DOM_EVENT, includes, addEventListener } from '../../tools/utils'
import { monitor } from '../internalMonitoring'
import type { Report, BrowserWindow, ReportType } from './browser.types'

export const CustomReportType = {
  intervention: 'intervention',
  deprecation: 'deprecation',
  cspViolation: 'csp_violation',
} as const

export type CustomReportType = typeof CustomReportType[keyof typeof CustomReportType]

export interface CustomReport {
  type: CustomReportType
  id: string
  message: string
  stack?: string
}

export function initReportObservable(apis: CustomReportType[]) {
  const observables: Array<Observable<CustomReport>> = []

  if (includes(apis, CustomReportType.cspViolation)) {
    observables.push(createCspViolationReportObservable())
  }

  const reportTypes = apis.filter((api: CustomReportType): api is ReportType => api !== CustomReportType.cspViolation)
  if (reportTypes.length) {
    observables.push(createReportObservable(reportTypes))
  }

  return mergeObservables<CustomReport>(...observables)
}

function createReportObservable(reportTypes: ReportType[]) {
  const observable = new Observable<CustomReport>(() => {
    if (!(window as BrowserWindow).ReportingObserver) {
      return
    }

    const handleReports = monitor((reports: Report[]) =>
      reports.forEach((report) => {
        observable.notify(buildCustomReportFromReport(report))
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
  const observable = new Observable<CustomReport>(() => {
    const handleCspViolation = monitor((event: SecurityPolicyViolationEvent) => {
      observable.notify(buildCustomReportFromCspViolation(event))
    })

    const { stop } = addEventListener(document, DOM_EVENT.SECURITY_POLICY_VIOLATION, handleCspViolation)

    return stop
  })
  return observable
}

function buildCustomReportFromReport({ type, body }: Report): CustomReport {
  return {
    type,
    id: body.id,
    message: `${type}: ${body.message}`,
    stack: buildStack(body.id, body.message, body.sourceFile, body.lineNumber, body.columnNumber),
  }
}

function buildCustomReportFromCspViolation(event: SecurityPolicyViolationEvent): CustomReport {
  const type = CustomReportType.cspViolation
  const message = `'${event.blockedURI}' blocked by '${event.effectiveDirective}' directive`
  return {
    type,
    id: type,
    message: `${type}: ${message}`,
    stack: buildStack(type, message, event.sourceFile, event.lineNumber, event.columnNumber),
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
