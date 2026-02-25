import {
  SKIPPED,
  computeStackTrace,
  objectEntries,
  addTelemetryError,
  HookNames,
  isExperimentalFeatureEnabled,
  ExperimentalFeature,
} from '@datadog/browser-core'
import type { DecoratorFactory } from '@datadog/browser-core-next'
import type { Hooks, DefaultRumEventAttributes, AssembleHookParams } from '../hooks'
import type { Observation } from '../pipeline/rumPipelineEvents'

export interface SourceCodeContext {
  service: string
  version?: string
}

export interface BrowserWindow {
  DD_SOURCE_CODE_CONTEXT?: { [stack: string]: SourceCodeContext }
}
type StackFrameUrl = string

/**
 * Factory for source code context decoration.
 * The `findContext` dep encapsulates URL extraction from the observation (e.g. from
 * `observation.data.handlingStack`, `observation.data.errorStack`, or long-animation-frame scripts).
 * The caller (Task 7 wiring) provides this function based on the event shape.
 */
export function sourceCodeDecoratorFactory(deps: {
  findContext: (event: Observation) => SourceCodeContext | undefined
}): DecoratorFactory<Observation, { service?: string; version?: string }> {
  return {
    name: 'sourceCode',
    provides: [],
    requires: [],
    capabilities: { canDiscard: false },
    create: () => ({
      decorate: (event, _accumulated) => {
        const context = deps.findContext(event)
        if (!context) {
          return Promise.resolve({ status: 'skipped' as const })
        }
        return Promise.resolve({
          status: 'contributed' as const,
          attributes: { service: context.service, version: context.version },
        })
      },
    }),
  }
}

export function startSourceCodeContext(hooks: Hooks) {
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

    if (contextByFile.size === 0) {
      return SKIPPED
    }

    const url = getSourceUrl(domainContext, rawRumEvent)
    const context = url && contextByFile.get(url)

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
