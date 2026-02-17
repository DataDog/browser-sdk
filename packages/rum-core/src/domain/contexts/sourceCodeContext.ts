import {
  SKIPPED,
  computeStackTrace,
  objectEntries,
  addTelemetryError,
  HookNames,
  isExperimentalFeatureEnabled,
  ExperimentalFeature,
} from '@datadog/browser-core'
import type { Hooks, DefaultRumEventAttributes, AssembleHookParams } from '../hooks'

interface SourceCodeContext {
  service: string
  version?: string
}

export interface BrowserWindow {
  DD_SOURCE_CODE_CONTEXT?: { [stack: string]: SourceCodeContext }
}
type StackFrameUrl = string

export function startSourceCodeContext(hooks: Hooks) {
  if (!isExperimentalFeatureEnabled(ExperimentalFeature.SOURCE_CODE_CONTEXT)) {
    return
  }

  const browserWindow = window as BrowserWindow
  const contextByFile = new Map<StackFrameUrl, SourceCodeContext>()

  function buildContextByFile() {
    if (!browserWindow.DD_SOURCE_CODE_CONTEXT) {
      return
    }

    objectEntries(browserWindow.DD_SOURCE_CODE_CONTEXT).forEach(([stack, context]) => {
      const stackTrace = computeStackTrace({ stack })
      const firstFrame = stackTrace.stack[0]

      if (!firstFrame.url) {
        addTelemetryError('Source code context: missing frame url', { stack })
        return
      }
      // don't overwrite existing context
      if (!contextByFile.has(firstFrame.url)) {
        contextByFile.set(firstFrame.url, context)
      }
    })

    browserWindow.DD_SOURCE_CODE_CONTEXT = {}
  }

  buildContextByFile()

  hooks.register(HookNames.Assemble, ({ domainContext, rawRumEvent }): DefaultRumEventAttributes | SKIPPED => {
    buildContextByFile()

    if (rawRumEvent.type === 'view_update') {
      return SKIPPED
    }

    const url = getSourceUrl(domainContext, rawRumEvent)

    if (url) {
      const context = contextByFile.get(url)
      if (context) {
        return {
          type: rawRumEvent.type,
          service: context.service,
          version: context.version,
        }
      }
    }
    return SKIPPED
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
