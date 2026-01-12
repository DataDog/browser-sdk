import {
  SKIPPED,
  computeStackTrace,
  objectEntries,
  addTelemetryError,
  HookNames,
  isExperimentalFeatureEnabled,
  ExperimentalFeature,
} from '@datadog/browser-core'
import type { Hooks, DefaultRumEventAttributes } from '../hooks'

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
    let stack
    if ('handling_stack' in domainContext) {
      stack = domainContext.handling_stack
    }
    if (rawRumEvent.type === 'error' && 'stack' in rawRumEvent.error) {
      stack = rawRumEvent.error.stack
    }
    if (!stack) {
      return SKIPPED
    }
    const stackTrace = computeStackTrace({ stack })
    const firstFrame = stackTrace.stack[0]
    if (firstFrame.url) {
      const context = contextByFile.get(firstFrame.url)
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
