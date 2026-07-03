import { computeStackTrace, getSourceCodeContext } from '@datadog/browser-core'
import { SKIPPED } from '@datadog/js-core/assembly'
import type { DefaultRumEventAttributes, AssembleHookParams, AssembleHook } from '../hooks'

/**
 * Attributes service and version from the source code context (injected at build time by the
 * Datadog build plugins) to RUM events emitted by micro-frontend bundles.
 *
 * Note: service/version attribution relies on a single URL (the top frame of the error stack, or the
 * first script of a long animation frame). Debug IDs, on the other hand, are resolved separately and
 * cover every bundle URL across the full error cause chain — not just that top frame.
 */
export function startSourceCodeMfeContext(assembleHook: AssembleHook) {
  assembleHook.register(({ domainContext, rawRumEvent }): DefaultRumEventAttributes | SKIPPED => {
    const url = getSourceUrl(domainContext, rawRumEvent)
    if (!url) {
      return SKIPPED
    }

    const context = getSourceCodeContext(url)

    if (!context) {
      return SKIPPED
    }

    return {
      type: rawRumEvent.type,
      service: context.service,
      version: context.version,
    }
  })
}

function getSourceUrl(
  domainContext: AssembleHookParams['domainContext'],
  rawRumEvent: AssembleHookParams['rawRumEvent']
) {
  if (rawRumEvent.type === 'long_task' && rawRumEvent.long_task.entry_type === 'long-animation-frame') {
    return rawRumEvent.long_task.scripts[0]?.source_url
  }

  let stack
  if ('handlingStack' in domainContext) {
    stack = domainContext.handlingStack
  }

  if (rawRumEvent.type === 'error' && rawRumEvent.error.stack) {
    stack = rawRumEvent.error.stack
  }
  const stackTrace = computeStackTrace({ stack })

  return stackTrace.stack[0]?.url
}
