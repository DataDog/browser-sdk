import { mockable, clearTimeout, setTimeout } from '@datadog/js-core/util'
import { addEventListener, DOM_EVENT } from '@datadog/js-core/dom'
import { clocksNow } from '@datadog/js-core/time'
import type { SessionManager, DeflateEncoderStreamId, Encoder } from '@datadog/browser-core'
import { canUseEventBridge, isSampled, correctedChildSampleRate } from '@datadog/browser-core'
import { monitorError } from '@datadog/js-core/monitor'

import type { LifeCycle, RumConfiguration, ViewHistory } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'
import { createBrowserProfiler } from '../../browser/browserProfiler'
import type {
  RumProfilerInstance,
  RumProfilerRunningInstance,
  RUMProfiler,
  RUMProfilerConfiguration,
  RumProfilerStoppedInstance,
} from './types'
import type { ProfilingContextManager } from './profilingContext'
import { takeEarlyCollectionProfiler } from './earlyCollectionProfiler'
import type { EarlyCollectionProfiler } from './earlyCollectionProfiler'
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

  const globalCleanupTasks: Array<() => void> = []
  let instance: RumProfilerInstance = { state: 'stopped', stateReason: 'initializing' }
  let quotaCheckGeneration = 0

  lifeCycle.subscribe(LifeCycleEventType.SESSION_EXPIRED, () => {
    stopProfiling('session-expired')
  })

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    const newSession = session.findTrackedSession()

    if (
      instance.state === 'stopped' &&
      (instance.stateReason === 'session-expired' || instance.stateReason === 'quota_ko') &&
      newSession &&
      isSampled(
        newSession.id,
        correctedChildSampleRate(configuration.sessionSampleRate, configuration.profilingSampleRate)
      )
    ) {
      start()
    }
  })

  function start(): void {
    if (instance.state === 'running') {
      return
    }

    globalCleanupTasks.push(
      addEventListener(window, DOM_EVENT.VISIBILITY_CHANGE, handleVisibilityChange).stop,
      addEventListener(window, DOM_EVENT.BEFORE_UNLOAD, handleBeforeUnload).stop
    )

    // Adopt the profiler started before the SDK loaded, including its collection period.
    startNextProfilerInstance(takeEarlyCollectionProfiler())
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
          if (
            checkGeneration === quotaCheckGeneration &&
            (instance.state === 'running' || instance.state === 'paused') &&
            result.decision === 'quota_ko'
          ) {
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

  function startNextProfilerInstance(earlyProfiler?: EarlyCollectionProfiler): void {
    // Collect data from previous running instance (fire-and-forget)
    if (instance.state === 'running') {
      stopAndCollectProfilerInstance(instance)
    }

    const result = createBrowserProfiler(
      profilerConfiguration,
      () => startNextProfilerInstance(),
      earlyProfiler?.profiler
    )
    if (result.status === 'error') {
      profilingContextManager.set({ status: 'error', error_reason: result.reason })
      return
    }

    profilingContextManager.set({
      status: 'running',
      error_reason: undefined,
      // `early` when adopting the Profiler instance started by the early
      // collection package: the first profile covers the early collection
      // period. The field is absent for instances the SDK starts itself, so
      // only early collection is reported in `_dd.profiling`.
      ...(earlyProfiler ? { collection_type: 'early' as const } : {}),
    })

    // Kick-off the new instance. Caveat for the early collection adoption: the
    // early Profiler's buffer (~9,000 samples, ~90 s at the 10 ms interval,
    // ~144 s if the browser clamps to a coarser one) can fill before the SDK
    // takes over. An exhausted instance is undetectable at adoption: it keeps
    // `stopped: false` and nothing in its API surface reveals it. We do not
    // track buffer exhaustion in the early collection contract; the instance
    // is adopted as running and the normal collection interval does the
    // rollover. In that rare case (the SDK evaluated more than ~90 s after
    // page load), the buffered samples are preserved and emitted, but no new
    // sample is taken until adoption + collectIntervalMs (~60 s later).
    instance = {
      state: 'running',
      startClocks: earlyProfiler?.startClocks ?? clocksNow(),
      browserProfiler: result.profiler,
      timeoutId: setTimeout(startNextProfilerInstance, profilerConfiguration.collectIntervalMs),
      sessionId: session.findTrackedSession()?.id,
    }
  }

  function stopAndCollectProfilerInstance(
    { timeoutId, startClocks, sessionId, browserProfiler }: RumProfilerRunningInstance,
    { discard = false } = {}
  ) {
    clearTimeout(timeoutId)
    const endClocks = clocksNow()
    browserProfiler
      .stop()
      .then((trace) => {
        if (!discard) {
          profileAssembly.assemble(trace, startClocks, endClocks, sessionId)
        }
      })
      .catch(monitorError)
  }

  function stopProfilerInstance(stateReason: RumProfilerStoppedInstance['stateReason']) {
    // Preserve the stop reason unless the user explicitly stops the profiler.
    if (instance.state === 'stopped' && stateReason !== 'stopped-by-user') {
      return
    }

    const previousInstance = instance
    instance = { state: 'stopped', stateReason }

    if (previousInstance.state === 'running') {
      stopAndCollectProfilerInstance(previousInstance, { discard: stateReason === 'quota_ko' })
    }
  }

  function pauseProfilerInstance() {
    if (instance.state !== 'running') {
      return
    }
    const runningInstance = instance
    instance = { state: 'paused' }
    stopAndCollectProfilerInstance(runningInstance)
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
