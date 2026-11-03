import { SKIPPED } from '@datadog/js-core/assembly'
import { globalObject } from '@datadog/js-core/util'
import { display } from './display'
import { collectExceptionReplay, registerExceptionReplayPlugin, sendExceptionReplay } from './exceptionReplay'

// The plugin is typed structurally, rather than with the RUM Browser SDK's `RumPlugin` type, so that
// the Live Debugger SDK doesn't depend on the RUM Browser SDK.

interface EventHookParams {
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

type AssembleEventHook = (params: EventHookParams) => ExceptionReplayEventAttributes | SKIPPED
type EventCollectedHook = (params: EventHookParams) => void

interface ExceptionReplayPluginOnInitOptions {
  initConfiguration: { trackingConsent?: string }
  publicApi: { getInternalContext: () => object | undefined }
  registerAssembleEventHook: (callback: AssembleEventHook) => unknown
  // Missing from RUM Browser SDK versions older than this plugin
  registerEventCollectedHook?: (callback: EventCollectedHook) => unknown
}

/**
 * Exception Replay plugin for the RUM Browser SDK. Compatible with the RUM Browser SDK's `RumPlugin`.
 */
export interface ExceptionReplayPlugin {
  name: string
  onInit(options: ExceptionReplayPluginOnInitOptions): void
  onRumStart(): void
}

export interface RumGlobal {
  // The async loading snippet also defines it, and queues the callbacks until the SDK loads
  onReady?: (callback: () => void) => void
  // Missing from RUM Browser SDK versions older than this plugin
  addPlugin?: (plugin: ExceptionReplayPlugin) => void
}

interface BrowserWindow {
  DD_RUM?: RumGlobal
}

/**
 * Add the Exception Replay plugin to the RUM Browser SDK on the page, once it has loaded. Called by
 * `DD_DEBUGGER.init()`, so customers don't have to change their RUM configuration.
 *
 * Does nothing if the RUM Browser SDK isn't on the page, since the Live Debugger SDK also works
 * without it.
 */
export function addExceptionReplayPluginToRum(): void {
  ;(globalObject as BrowserWindow).DD_RUM?.onReady?.(() => {
    const rum = (globalObject as BrowserWindow).DD_RUM
    if (!rum?.addPlugin) {
      display.warn('Exception Replay requires a version of the RUM Browser SDK that matches the Live Debugger SDK.')
      return
    }
    rum.addPlugin(exceptionReplayPlugin())
  })
}

/**
 * Create the Exception Replay plugin for the RUM Browser SDK.
 *
 * When an application built with the Live Debugger build plugin's `exceptionReplay` option throws,
 * the Live Debugger SDK captures the arguments of the instrumented functions the exception passes
 * through. When RUM reports the error, this plugin links those captures to the RUM error event, and
 * sends them as snapshots once the event passes `beforeSend` and the event rate limits, so Error
 * Tracking can show them on the error's stack frames.
 *
 * Exception Replay only starts once RUM has called the plugin's `onInit` and `DD_DEBUGGER.init()` is
 * called. It doesn't capture anything in sessions that RUM doesn't track, or before tracking consent
 * is granted.
 */
export function exceptionReplayPlugin(): ExceptionReplayPlugin {
  let rumStarted = false

  return {
    name: 'exception-replay',
    onInit({ initConfiguration, publicApi, registerAssembleEventHook, registerEventCollectedHook }) {
      if (!registerEventCollectedHook) {
        display.warn('Exception Replay requires a version of the RUM Browser SDK that matches the Live Debugger SDK.')
        return
      }

      // Until RUM starts, its session isn't known yet, and RUM reports the errors it buffered once
      // it starts, so they're captured, unless RUM is waiting for tracking consent
      registerExceptionReplayPlugin(() =>
        rumStarted ? publicApi.getInternalContext() !== undefined : initConfiguration.trackingConsent !== 'not-granted'
      )

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

      registerEventCollectedHook(({ eventType, domainContext }) => {
        if (eventType === 'error' && 'error' in domainContext) {
          sendExceptionReplay(domainContext.error)
        }
      })
    },
    onRumStart() {
      rumStarted = true
    },
  }
}
