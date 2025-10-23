import type { Context } from '@datadog/browser-core'
import { SKIPPED, computeStackTrace, objectEntries, addTelemetryError, HookNames } from '@datadog/browser-core'
import type { Hooks, DefaultRumEventAttributes } from '../hooks'

interface BrowserWindow {
  DD_SOURCE_CODE_CONTEXT?: { [stack: string]: Context }
}
export function startSourceCodeContext(hooks: Hooks) {
  const browserWindow = window as BrowserWindow
  browserWindow.DD_SOURCE_CODE_CONTEXT = browserWindow.DD_SOURCE_CODE_CONTEXT || {}
  const contextByFile = new Map<string, Context>()

  objectEntries(browserWindow.DD_SOURCE_CODE_CONTEXT).forEach(([stack, context]) => {
    const stackTrace = computeStackTrace({ stack })
    const firstFrame = stackTrace.stack[0]
    if (firstFrame.url) {
      contextByFile.set(firstFrame.url, context)
    } else {
      addTelemetryError('Source code context: missing frame url', { stack })
    }
  })

  // TODO: allow late global variable update to be taken into account

  hooks.register(HookNames.Assemble, ({ domainContext, rawRumEvent }) => {
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
        return context as DefaultRumEventAttributes
      }
    }
    return SKIPPED
  })
}
