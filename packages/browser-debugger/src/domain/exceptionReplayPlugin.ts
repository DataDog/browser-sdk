import { SKIPPED } from '@datadog/js-core/assembly'
import { collectExceptionReplay, registerExceptionReplayPlugin } from './exceptionReplay'

// The plugin is typed structurally, rather than with the RUM Browser SDK's `RumPlugin` type, so that
// the Live Debugger SDK doesn't depend on the RUM Browser SDK.

interface AssembleEventHookParams {
  eventType: string
  domainContext: object
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- `type` is needed for implicit index signature compatibility with RUM event types
type ExceptionReplayEventAttributes = {
  type: 'error'
  error: { debug_info_captured: 'true' }
  _dd: {
    exception_replay: {
      exception_id: string
      frames: Array<{ index: number; snapshot_id: string }>
    }
  }
}

type AssembleEventHook = (params: AssembleEventHookParams) => ExceptionReplayEventAttributes | SKIPPED

/**
 * Exception Replay plugin for the RUM Browser SDK. Compatible with the RUM Browser SDK's `RumPlugin`.
 */
export interface ExceptionReplayPlugin {
  name: string
  onInit(options: { registerAssembleEventHook: (callback: AssembleEventHook) => unknown }): void
}

/**
 * Create the Exception Replay plugin for the RUM Browser SDK.
 *
 * When an application built with the Live Debugger build plugin's `exceptionReplay` option throws,
 * the Live Debugger SDK captures the arguments of the instrumented functions the exception passes
 * through. When RUM reports the error, this plugin sends those captures as snapshots and links them
 * to the RUM error event, so Error Tracking can show them on the error's stack frames.
 *
 * Exception Replay only starts once the plugin is registered and `DD_DEBUGGER.init()` is called.
 */
export function exceptionReplayPlugin(): ExceptionReplayPlugin {
  return {
    name: 'exception-replay',
    onInit({ registerAssembleEventHook }) {
      registerExceptionReplayPlugin()

      registerAssembleEventHook(({ eventType, domainContext }) => {
        if (eventType !== 'error') {
          return SKIPPED
        }

        const attributes = collectExceptionReplay('error' in domainContext ? domainContext.error : undefined)
        if (!attributes) {
          return SKIPPED
        }

        return {
          type: 'error',
          error: {
            // Error Tracking reads this flag as a string, as backend tracers set it on spans
            debug_info_captured: 'true',
          },
          _dd: {
            exception_replay: {
              exception_id: attributes.exceptionId,
              frames: attributes.frames.map(({ index, snapshotId }) => ({ index, snapshot_id: snapshotId })),
            },
          },
        }
      })
    },
  }
}
