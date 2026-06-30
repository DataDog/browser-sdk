import { computeStackTrace, getSourceCodeContext } from '@datadog/browser-core'
import { SKIPPED } from '@datadog/js-core/assembly'
import type { DefaultRumEventAttributes, AssembleHookParams, AssembleHook } from '../hooks'

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
