import type { Encoder } from '@datadog/browser-core'
import {
  addEventListener,
  clearTimeout,
  setTimeout,
  DOM_EVENT,
  monitorError,
  display,
  getGlobalObject,
  clocksOrigin,
  clocksNow,
  elapsed,
  DeflateEncoderStreamId,
  mockable,
} from '@datadog/browser-core'

import type {
  LifeCycle,
  RumConfiguration,
  RumSessionManager,
  TransportPayload,
  ViewHistory,
} from '@datadog/browser-rum-core'
import { createFormDataTransport, LifeCycleEventType } from '@datadog/browser-rum-core'
import type { BrowserProfilerTrace, RumViewEntry } from '../../types'
import type {
  RumProfilerInstance,
  RumProfilerRunningInstance,
  Profiler,
  RUMProfiler,
  RUMProfilerConfiguration,
  RumProfilerStoppedInstance,
} from './types'
import { getNumberOfSamples } from './utils/getNumberOfSamples'
import type { ProfilingContextManager } from './profilingContext'
import { getCustomOrDefaultViewName } from './utils/getCustomOrDefaultViewName'
import { assembleProfilingPayload } from './transport/assembly'
import { createLongTaskHistory } from './longTaskHistory'

export const DEFAULT_RUM_PROFILER_CONFIGURATION: RUMProfilerConfiguration = {
  sampleIntervalMs: 10, // Sample stack trace every 10ms
  collectIntervalMs: 60000, // Collect data every minute
  minProfileDurationMs: 5000, // Require at least 5 seconds of profile data to reduce noise and cost
  minNumberOfSamples: 50, // Require at least 50 samples (~500 ms) to report a profile to reduce noise and cost
}

export function createRumProfiler(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  session: RumSessionManager,
  profilingContextManager: ProfilingContextManager,
  createEncoder: (streamId: DeflateEncoderStreamId) => Encoder,
  viewHistory: ViewHistory,
  profilerConfiguration: RUMProfilerConfiguration = DEFAULT_RUM_PROFILER_CONFIGURATION
): RUMProfiler {
  const transport = createFormDataTransport(configuration, lifeCycle, createEncoder, DeflateEncoderStreamId.PROFILING)

  let lastViewEntry: RumViewEntry | undefined

  // Global clean-up tasks for listeners that are not specific to a profiler instance (eg. visibility change, before unload)
  const globalCleanupTasks: Array<() => void> = []
  const longTaskHistory = mockable(createLongTaskHistory)(lifeCycle)

  let instance: RumProfilerInstance = { state: 'stopped', stateReason: 'initializing' }

  // Stops the profiler when session expires
  lifeCycle.subscribe(LifeCycleEventType.SESSION_EXPIRED, () => {
    stopProfiling('session-expired')
  })

  // Start the profiler again when session is renewed
  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    if (instance.state === 'stopped' && instance.stateReason === 'session-expired') {
      start()
    }
  })

  // Public API to start the profiler.
  function start(): void {
    if (instance.state === 'running') {
      return
    }

    const viewEntry = viewHistory.findView()

    // Add initial view
    // Note: `viewEntry.name` is only filled when users use manual view creation via `startView` method.
    lastViewEntry = viewEntry
      ? {
          startClocks: viewEntry.startClocks,
          viewId: viewEntry.id,
          viewName: getCustomOrDefaultViewName(viewEntry.name, document.location.pathname),
        }
      : undefined

    // Add global clean-up tasks for listeners that are not specific to a profiler instance (eg. visibility change, before unload)
    globalCleanupTasks.push(
      addEventListener(configuration, window, DOM_EVENT.VISIBILITY_CHANGE, handleVisibilityChange).stop,
      addEventListener(configuration, window, DOM_EVENT.BEFORE_UNLOAD, handleBeforeUnload).stop
    )

    // Start profiler instance
    startNextProfilerInstance()
  }

  // Public API to manually stop the profiler.
  function stop() {
    stopProfiling('stopped-by-user')
  }

  function stopProfiling(reason: RumProfilerStoppedInstance['stateReason']) {
    // Stop current profiler instance (data collection happens async in background)
    stopProfilerInstance(reason)

    // Cleanup global listeners and reset the array to prevent accumulation across start/stop cycles
    globalCleanupTasks.forEach((task) => task())
    globalCleanupTasks.length = 0

    // Update Profiling status once the Profiler has been stopped.
    profilingContextManager.set({ status: 'stopped', error_reason: undefined })
  }

  /**
   * Whenever a new Profiler instance is started, we need to add event listeners to surroundings (RUM Events, Long Tasks, etc) to enrich the Profiler data.
   * If the instance is already running, we can keep the same event listeners.
   */
  function addEventListeners(existingInstance: RumProfilerInstance) {
    if (existingInstance.state === 'running') {
      // Instance is already running, so we can keep same event listeners.
      return {
        cleanupTasks: existingInstance.cleanupTasks,
      }
    }

    // Store clean-up tasks for this instance (tasks to be executed when the Profiler is stopped or paused.)
    const cleanupTasks = []

    // Whenever the View is updated, we add a views entry to the profiler instance.
    const viewUpdatedSubscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (view) => {
      const viewEntry = {
        viewId: view.id,
        // Note: `viewName` is only filled when users use manual view creation via `startView` method.
        viewName: getCustomOrDefaultViewName(view.name, document.location.pathname),
        startClocks: view.startClocks,
      }

      collectViewEntry(viewEntry)

      // Update last view entry
      lastViewEntry = viewEntry
    })
    cleanupTasks.push(viewUpdatedSubscription.unsubscribe)

    return {
      cleanupTasks,
    }
  }

  function startNextProfilerInstance(): void {
    // These APIs might be unavailable in some browsers
    const globalThisProfiler: Profiler | undefined = getGlobalObject<any>().Profiler

    if (!globalThisProfiler) {
      profilingContextManager.set({ status: 'error', error_reason: 'not-supported-by-browser' })
      throw new Error('RUM Profiler is not supported in this browser.')
    }

    // Collect data from previous running instance (fire-and-forget)
    if (instance.state === 'running') {
      collectProfilerInstance(instance)
    }

    const { cleanupTasks } = addEventListeners(instance)

    let profiler: Profiler
    try {
      // We have to create new Profiler each time we start a new instance
      profiler = new globalThisProfiler({
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
      views: [],
      cleanupTasks,
      longTasks: [],
    }

    // Add last view entry
    collectViewEntry(lastViewEntry)

    // Add event handler case we overflow the buffer
    profiler.addEventListener('samplebufferfull', handleSampleBufferFull)
  }

  function collectProfilerInstance(runningInstance: RumProfilerRunningInstance) {
    // Cleanup instance
    clearTimeout(runningInstance.timeoutId)
    runningInstance.profiler.removeEventListener('samplebufferfull', handleSampleBufferFull)

    // Store instance data snapshot in local variables to use in async callback
    const { startClocks, views } = runningInstance

    // Stop current profiler to get trace
    runningInstance.profiler
      .stop()
      .then((trace) => {
        const endClocks = clocksNow()
        const duration = elapsed(startClocks.timeStamp, endClocks.timeStamp)
        const longTasks = longTaskHistory.findAll(startClocks.relative, duration)
        const isBelowDurationThreshold = duration < profilerConfiguration.minProfileDurationMs
        const isBelowSampleThreshold = getNumberOfSamples(trace.samples) < profilerConfiguration.minNumberOfSamples

        if (longTasks.length === 0 && (isBelowDurationThreshold || isBelowSampleThreshold)) {
          // Skip very short profiles to reduce noise and cost, but keep them if they contain long tasks.
          return
        }

        handleProfilerTrace(
          // Enrich trace with time and instance data
          Object.assign(trace, {
            startClocks,
            endClocks,
            clocksOrigin: clocksOrigin(),
            longTasks,
            views,
            sampleInterval: profilerConfiguration.sampleIntervalMs,
          })
        )
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

    // Cleanup instance-specific tasks (e.g., view listener)
    runningInstance.cleanupTasks.forEach((cleanupTask) => cleanupTask())

    // Collect and send profile data in background - doesn't block state transitions
    collectProfilerInstance(runningInstance)
  }

  function pauseProfilerInstance() {
    if (instance.state !== 'running') {
      return
    }

    // Capture the running instance before changing state
    const runningInstance = instance

    // Update state synchronously
    instance = { state: 'paused' }

    // Cleanup instance-specific tasks
    runningInstance.cleanupTasks.forEach((cleanupTask) => cleanupTask())

    // Collect and send profile data in background
    collectProfilerInstance(runningInstance)
  }

  function collectViewEntry(viewEntry: RumViewEntry | undefined): void {
    if (instance.state !== 'running' || !viewEntry) {
      return
    }

    // Add entry to views
    instance.views.push(viewEntry)
  }

  function handleProfilerTrace(trace: BrowserProfilerTrace): void {
    // Find current session to assign it to the Profile.
    const sessionId = session.findTrackedSession()?.id
    const payload = assembleProfilingPayload(trace, configuration, sessionId)

    void transport.send(payload as unknown as TransportPayload)
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
