import { computeStackTrace, ErrorSource, getSourceCodeContext } from '@datadog/browser-core'
import type { Report } from '@datadog/browser-core'
import { SKIPPED } from '@datadog/js-core/assembly'
import type { ReportLogsEventDomainContext } from '../../domainContext.types'
import type { AssembleHook, AssembleHookParams, DefaultLogsEventAttributes } from '../hooks'

/**
 * Attributes logs to the micro-frontend bundle that produced them, using the same source code
 * context as RUM. Error stacks take precedence over the call site used to report the error.
 */
export function startSourceCodeMfeContext(assembleHook: AssembleHook) {
  assembleHook.register(({ domainContext, rawLogsEvent }): DefaultLogsEventAttributes | SKIPPED => {
    const url = getSourceUrl(domainContext, rawLogsEvent)
    const context = url && getSourceCodeContext(url)
    if (!context) {
      return SKIPPED
    }

    return {
      service: context.service,
      version: context.version,
    }
  })
}

function getSourceUrl(
  domainContext: AssembleHookParams['domainContext'],
  rawLogsEvent: AssembleHookParams['rawLogsEvent']
) {
  if (isReport(domainContext)) {
    return domainContext.report.body.sourceFile
  }

  // Network error stacks can contain response bodies, so use the request's call site instead.
  const handlingStack = domainContext && 'handlingStack' in domainContext ? domainContext.handlingStack : undefined
  const stack = (rawLogsEvent.origin !== ErrorSource.NETWORK && rawLogsEvent.error?.stack) || handlingStack
  return stack ? computeStackTrace({ stack }).stack[0]?.url : undefined
}

function isReport(
  domainContext: AssembleHookParams['domainContext']
): domainContext is ReportLogsEventDomainContext & { report: Report } {
  return !!domainContext && 'report' in domainContext && 'body' in domainContext.report
}
