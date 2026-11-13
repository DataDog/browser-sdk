import { globalObject, mockable, clearTimeout, setTimeout } from '@datadog/js-core/util'
import { addEventListener, DOM_EVENT } from '@datadog/js-core/dom'
import type { Profiler } from '@datadog/js-core/util'
import { clocksNow } from '@datadog/js-core/time'
import type { SessionManager, DeflateEncoderStreamId, Encoder } from '@datadog/browser-core'
import { canUseEventBridge, display, isSampled, correctedChildSampleRate } from '@datadog/browser-core'
import { monitorError } from '@datadog/js-core/monitor'

import type { LifeCycle, RumConfiguration, ViewHistory } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'
import type {
  RumProfilerInstance,
  RumProfilerRunningInstance,
  RUMProfiler,
  RUMProfilerConfiguration,
  RumProfilerStoppedInstance,
} from './types'
import type { ProfilingContextManager } from './profilingContext'
import { checkProfilingQuota } from './quotaCheck'
import type { QuotaReason } from './quotaCheck'
import { createProfileAssembly } from './profileAssembly'
import { createBridgeEmitter } from './transport/profilingBridge'
import { createFormDataEmitter } from './transport/formDataEmitter'

export const DEFAULT_RUM_PROFILER_CONFIGURATION: RUMProfilerConfiguration = {
  sampleIntervalMs: 10, // Sample stack trace every 10ms
  collectIntervalMs: 60000, // Collect data every minute
  minProfileDurationMs: 5000, // Require at least 5 seconds of profile data to reduce noise and cost
}

export function createRumProfiler(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  session: SessionManager,
  profilingContextManager: ProfilingContextManager,
  createEncoder: (streamId: DeflateEncoderStreamId) => Encoder,
  viewHistory: ViewHistory,
  profilerConfiguration: RUMProfilerConfiguration = DEFAULT_RUM_PROFILER_CONFIGURATION
): RUMProfiler {
  const emitPayload = canUseEventBridge()
    ? mockable(createBridgeEmitter)()
    : mockable(createFormDataEmitter)(configuration, lifeCycle, createEncoder)
  const profileAssembly = createProfileAssembly(
    configuration,
    lifeCycle,
    viewHistory,
    profilerConfiguration,
    emitPayload
  )

  // Global clean-up tasks for listeners that are not specific to a profiler instance (eg. visibility change, before unload)
  const globalCleanupTasks: Array<() => void> = []

  let instance: RumProfilerInstance = { state: 'stopped', stateReason: 'initializing' }
  let quotaCheckGeneration = 0

  // Stops the profiler when session expires
  lifeCycle.subscribe(LifeCycleEventType.SESSION_EXPIRED, () => {
    stopProfiling('session-expired')
  })

  // Start the profiler again when session is renewed
  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    if (
      instance.state === 'stopped' &&
      (instance.stateReason === 'session-expired' || instance.stateReason === 'quota_ko')
    ) {
      const newSession = session.findTrackedSession()
      if (
        !newSession ||
        !isSampled(
          newSession.id,
          correctedChildSampleRate(configuration.sessionSampleRate, configuration.profilingSampleRate)
        )
      ) {
        return
      }
      start()
    }
  })

  // Public API to start the profiler.
  function start(): void {
    if (instance.state === 'running') {
      return
    }

    // Add global clean-up tasks for listeners that are not specific to a profiler instance (eg. visibility change, before unload)
    globalCleanupTasks.push(
      addEventListener(window, DOM_EVENT.VISIBILITY_CHANGE, handleVisibilityChange).stop,
      addEventListener(window, DOM_EVENT.BEFORE_UNLOAD, handleBeforeUnload).stop
    )

    // Start profiler instance
    startNextProfilerInstance()
    triggerQuotaCheck()
  }

  function triggerQuotaCheck() {
    if (canUseEventBridge()) {
      // Quota check only in non-bridge mode.
      return
    }
    // Optimistic: profiler already recording, only gates sending.
    // Generation counter invalidates results from a prior session (incremented on each start() call).
    // State guard handles within-session cancellation (user stop, session expiry, etc.).
    const checkGeneration = ++quotaCheckGeneration
    const sessionId = session.findTrackedSession()?.id
    if (sessionId) {
      mockable(checkProfilingQuota)(configuration, sessionId)
        .then((result) => {
          if (checkGeneration !== quotaCheckGeneration) {
            return
          }
          if (instance.state !== 'running' && instance.state !== 'paused') {
            return
          }
          if (result.decision === 'quota_ko') {
            stopProfiling('quota_ko', result.reason)
          }
        })
        .catch(monitorError)
    }
  }

  // Public API to manually stop the profiler.
  function stop() {
    stopProfiling('stopped-by-user')
  }

  function stopProfiling(reason: RumProfilerStoppedInstance['stateReason'], quotaReason?: QuotaReason) {
    // Stop current profiler instance (data collection happens async in background)
    stopProfilerInstance(reason)

    // Cleanup global listeners and reset the array to prevent accumulation across start/stop cycles
    globalCleanupTasks.forEach((task) => task())
    globalCleanupTasks.length = 0

    // Update Profiling status once the Profiler has been stopped.
    profilingContextManager.set({ status: 'stopped', error_reason: undefined, quota_reason: quotaReason })
  }

  function startNextProfilerInstance(): void {
    // These APIs might be unavailable in some browsers
    const profilerConstructor = globalObject.Profiler

    if (!profilerConstructor) {
      profilingContextManager.set({ status: 'error', error_reason: 'not-supported-by-browser' })
      throw new Error('RUM Profiler is not supported in this browser.')
    }

    // Collect data from previous running instance (fire-and-forget)
    if (instance.state === 'running') {
      collectProfilerInstance(instance)
    }

    let profiler: Profiler
    try {
      // We have to create new Profiler each time we start a new instance
      profiler = new profilerConstructor({
        sampleInterval: profilerConfiguration.sampleIntervalMs,
        // Keep buffer size at 1.5 times of minimum required to collect data for a profiling instance
        maxBufferSize: Math.round(
          (profilerConfiguration.collectIntervalMs * 1.5) / profilerConfiguration.sampleIntervalMs
        ),
      })
    } catch (e) {
      if (e instanceof Error && e.message.includes('disabled by Document Policy')) {
        // Missing Response Header (`js-profiling`) that is required to enable the profiler.
        // We should suggest the user to enable the Response Header in their server configuration.
        display.warn(
          '[DD_RUM] Profiler startup failed. Ensure your server includes the `Document-Policy: js-profiling` response header when serving HTML pages.',
          e
        )
        profilingContextManager.set({ status: 'error', error_reason: 'missing-document-policy-header' })
      } else {
        profilingContextManager.set({ status: 'error', error_reason: 'unexpected-exception' })
      }
      return
    }

    profilingContextManager.set({ status: 'running', error_reason: undefined })

    // Kick-off the new instance
    instance = {
      state: 'running',
      startClocks: clocksNow(),
      profiler,
      timeoutId: setTimeout(startNextProfilerInstance, profilerConfiguration.collectIntervalMs),
      sessionId: session.findTrackedSession()?.id,
    }

    // Add event handler case we overflow the buffer
    // eslint-disable-next-line local-rules/disallow-zone-js-patched-values -- FIXME use the `addEventListener` helper
    profiler.addEventListener('samplebufferfull', handleSampleBufferFull)
  }

  function collectProfilerInstance(runningInstance: RumProfilerRunningInstance) {
    // Cleanup instance
    clearTimeout(runningInstance.timeoutId)
    // eslint-disable-next-line local-rules/disallow-zone-js-patched-values -- FIXME use the `addEventListener` helper
    runningInstance.profiler.removeEventListener('samplebufferfull', handleSampleBufferFull)

    const { startClocks, sessionId } = runningInstance
    runningInstance.profiler
      .stop()
      .then((trace) => {
        profileAssembly.assemble(trace, startClocks, sessionId)
      })
      .catch(monitorError)
  }

  function stopProfilerInstance(stateReason: RumProfilerStoppedInstance['stateReason']) {
    if (instance.state !== 'running') {
      if (
        // If paused, profiler data was already collected during pause, just update state
        instance.state === 'paused' ||
        // Update stateReason when already stopped and the user explicitly stops the profiler,
        // so that SESSION_RENEWED does not override the user's intent.
        (instance.state === 'stopped' && stateReason === 'stopped-by-user')
      ) {
        instance = { state: 'stopped', stateReason }
      }

      return
    }

    // Capture the running instance before changing state
    const runningInstance = instance

    // Update state synchronously so SESSION_RENEWED check works immediately
    instance = { state: 'stopped', stateReason }

    if (stateReason === 'quota_ko') {
      // Discard data — quota denied means we should not send anything
      clearTimeout(runningInstance.timeoutId)
      // eslint-disable-next-line local-rules/disallow-zone-js-patched-values -- FIXME use the `addEventListener` helper
      runningInstance.profiler.removeEventListener('samplebufferfull', handleSampleBufferFull)
      void runningInstance.profiler.stop().catch(monitorError)
    } else {
      // Collect and send profile data in background - doesn't block state transitions
      collectProfilerInstance(runningInstance)
    }
  }

  function pauseProfilerInstance() {
    if (instance.state !== 'running') {
      return
    }

    // Capture the running instance before changing state
    const runningInstance = instance

    // Update state synchronously
    instance = { state: 'paused' }

    // Collect and send profile data in background
    collectProfilerInstance(runningInstance)
  }

  function handleSampleBufferFull(): void {
    startNextProfilerInstance()
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState === 'hidden' && instance.state === 'running') {
      // Pause when tab is hidden. We use paused state to distinguish between
      // paused by visibility change and stopped by user.
      // If profiler is paused by the visibility change, we should resume when
      // tab becomes visible again. That's not the case when user stops the profiler.
      pauseProfilerInstance()
    } else if (document.visibilityState === 'visible' && instance.state === 'paused') {
      // Resume when tab becomes visible again
      startNextProfilerInstance()
    }
  }

  function handleBeforeUnload(): void {
    // `unload` can in some cases be triggered while the page is still active (link to a different protocol like mailto:).
    // We can immediately flush (by starting a new profiler instance) to make sure we receive the data, and at the same time keep the profiler active.
    // In case of the regular unload, the profiler will be shut down anyway.
    startNextProfilerInstance()
  }

  function isStopped() {
    return instance.state === 'stopped'
  }

  function isRunning() {
    return instance.state === 'running'
  }

  function isPaused() {
    return instance.state === 'paused'
  }

  return { start, stop, isStopped, isRunning, isPaused }
}
