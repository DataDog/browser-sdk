import type { Duration, RelativeTime } from '@datadog/browser-core'
import {
  addEventListener,
  clearTimeout,
  setTimeout,
  DOM_EVENT,
  monitorError,
  display,
  getGlobalObject,
  relativeToClocks,
  clocksOrigin,
  clocksNow,
  elapsed,
} from '@datadog/browser-core'

import type { LifeCycle, RumConfiguration, RumSessionManager, ViewHistoryEntry } from '@datadog/browser-rum-core'
import { LifeCycleEventType, RumPerformanceEntryType, supportPerformanceTimingEvent } from '@datadog/browser-rum-core'
import type {
  RumProfilerTrace,
  RumProfilerInstance,
  Profiler,
  RUMProfiler,
  RUMProfilerConfiguration,
  RumViewEntry,
} from './types'
import { getNumberOfSamples } from './utils/getNumberOfSamples'
import {
  disableLongTaskRegistry,
  enableLongTaskRegistry,
  deleteLongTaskIdsBefore,
  getLongTaskId,
} from './utils/longTaskRegistry'
import { mayStoreLongTaskIdForProfilerCorrelation } from './profilingCorrelation'
import { transport } from './transport/transport'

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
  profilerConfiguration: RUMProfilerConfiguration = DEFAULT_RUM_PROFILER_CONFIGURATION
): RUMProfiler {
  const isLongAnimationFrameEnabled = supportPerformanceTimingEvent(RumPerformanceEntryType.LONG_ANIMATION_FRAME)

  let lastViewEntry: RumViewEntry | undefined

  // Global clean-up tasks for listeners that are not specific to a profiler instance (eg. visibility change, before unload)
  const globalCleanupTasks: Array<() => void> = []

  let instance: RumProfilerInstance = { state: 'stopped' }

  function start(viewEntry: ViewHistoryEntry | undefined): void {
    if (instance.state === 'running') {
      return
    }

    // Add initial view
    // Note: `viewEntry.name` is only filled when users use manual view creation via `startView` method.
    lastViewEntry = viewEntry
      ? { startClocks: viewEntry.startClocks, viewId: viewEntry.id, viewName: viewEntry.name }
      : undefined

    // Add global clean-up tasks for listeners that are not specific to a profiler instance (eg. visibility change, before unload)
    globalCleanupTasks.push(
      addEventListener(configuration, window, DOM_EVENT.VISIBILITY_CHANGE, handleVisibilityChange).stop,
      addEventListener(configuration, window, DOM_EVENT.BEFORE_UNLOAD, handleBeforeUnload).stop
    )

    // Start profiler instance
    startNextProfilerInstance()
  }

  async function stop() {
    // Stop current profiler instance
    await stopProfilerInstance('stopped')

    // Disable Long Task Registry as we no longer need to correlate them with RUM
    disableLongTaskRegistry()

    // Cleanup global listeners
    globalCleanupTasks.forEach((task) => task())
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
        observer: existingInstance.observer,
      }
    }

    // Store clean-up tasks for this instance (tasks to be executed when the Profiler is stopped or paused.)
    const cleanupTasks = []
    let observer: PerformanceObserver | undefined

    // Register everything linked to Long Tasks correlations with RUM, when enabled.
    if (configuration.trackLongTasks) {
      // Setup event listeners, and since we only listen to Long Tasks for now, we activate the Performance Observer only when they are tracked.
      observer = new PerformanceObserver(handlePerformance)
      observer.observe({
        entryTypes: [getLongTaskEntryType()],
      })

      // Whenever an Event is collected, when it's a Long Task, we may store the long task id for profiler correlation.
      const rawEventCollectedSubscription = lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (data) => {
        mayStoreLongTaskIdForProfilerCorrelation(data)
      })

      // Enable Long Task registry so we can correlate them with RUM
      enableLongTaskRegistry()

      cleanupTasks.push(() => observer?.disconnect())
      cleanupTasks.push(rawEventCollectedSubscription.unsubscribe)
    }

    // Whenever the View is updated, we add a views entry to the profiler instance.
    const viewUpdatedSubscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (view) => {
      // Note: `view.name` is only filled when users use manual view creation via `startView` method.
      collectViewEntry({ viewId: view.id, viewName: view.name, startClocks: view.startClocks })
    })
    cleanupTasks.push(viewUpdatedSubscription.unsubscribe)

    return {
      cleanupTasks,
      observer,
    }
  }

  function startNextProfilerInstance(): void {
    // These APIs might be unavailable in some browsers
    const globalThisProfiler: Profiler | undefined = getGlobalObject<any>().Profiler

    if (!globalThisProfiler) {
      throw new Error('RUM Profiler is not supported in this browser.')
    }

    // Don't wait for data collection to start next instance
    collectProfilerInstance(instance).catch(monitorError)

    const { cleanupTasks, observer } = addEventListeners(instance)

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
      // If we fail to create a profiler, it's likely due to the missing Response Header (`js-profiling`) that is required to enable the profiler.
      // We should suggest the user to enable the Response Header in their server configuration.
      display.warn(
        '[DD_RUM] Profiler startup failed. Ensure your server includes the `Document-Policy: js-profiling` response header when serving HTML pages.',
        e
      )
      return
    }

    // Kick-off the new instance
    instance = {
      state: 'running',
      startClocks: clocksNow(),
      profiler,
      timeoutId: setTimeout(startNextProfilerInstance, profilerConfiguration.collectIntervalMs),
      longTasks: [],
      views: [],
      cleanupTasks,
      observer,
    }

    // Add last view entry
    collectViewEntry(lastViewEntry)

    // Add event handler case we overflow the buffer
    profiler.addEventListener('samplebufferfull', handleSampleBufferFull)
  }

  async function collectProfilerInstance(lastInstance: RumProfilerInstance) {
    if (lastInstance.state !== 'running') {
      return
    }

    // Empty the performance observer buffer
    handleLongTaskEntries(lastInstance.observer?.takeRecords() ?? [])

    // Cleanup instance
    clearTimeout(lastInstance.timeoutId)
    lastInstance.profiler.removeEventListener('samplebufferfull', handleSampleBufferFull)

    // Store instance data snapshot in local variables to use in async callback
    const { startClocks, longTasks, views } = lastInstance

    // Capturing when we stop the profiler so we use this time as a reference to clean-up long task registry, eg. remove the long tasks that we collected already
    const collectClocks = clocksNow()

    // Stop current profiler to get trace
    await lastInstance.profiler
      .stop()
      .then((trace) => {
        const endClocks = clocksNow()

        const hasLongTasks = longTasks.length > 0
        const isBelowDurationThreshold = elapsed(startClocks.timeStamp, endClocks.timeStamp) < profilerConfiguration.minProfileDurationMs
        const isBelowSampleThreshold = getNumberOfSamples(trace.samples) < profilerConfiguration.minNumberOfSamples

        if (!hasLongTasks && (isBelowDurationThreshold || isBelowSampleThreshold)) {
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

        // Clear long task registry, remove entries that we collected already (eg. avoid slowly growing memory usage by keeping outdated entries)
        deleteLongTaskIdsBefore(collectClocks)
      })
      .catch(monitorError)
  }

  async function stopProfilerInstance(nextState: 'paused' | 'stopped') {
    if (instance.state !== 'running') {
      return
    }

    // Cleanup tasks
    instance.cleanupTasks.forEach((cleanupTask) => cleanupTask())

    await collectProfilerInstance(instance)

    instance = { state: nextState }
  }

  function collectViewEntry(viewEntry: RumViewEntry | undefined): void {
    if (instance.state !== 'running' || !viewEntry) {
      return
    }

    // Add entry to views
    instance.views.push(viewEntry)
  }

  function handleProfilerTrace(trace: RumProfilerTrace): void {
    // Find current session to assign it to the Profile.
    const sessionId = session.findTrackedSession()?.id

    // Send JSON Profile to intake.
    transport
      .sendProfile(trace, configuration.profilingEndpointBuilder, configuration.applicationId, sessionId)
      .catch(monitorError)
  }

  function handleSampleBufferFull(): void {
    startNextProfilerInstance()
  }

  function handlePerformance(list: PerformanceObserverEntryList): void {
    handleLongTaskEntries(list.getEntries())
  }

  function handleLongTaskEntries(entries: PerformanceEntryList): void {
    if (instance.state !== 'running') {
      return
    }

    for (const entry of entries) {
      if (entry.duration < profilerConfiguration.sampleIntervalMs) {
        // Skip entries shorter than sample interval to reduce noise and size of profile
        continue
      }

      const startClocks = relativeToClocks(entry.startTime as RelativeTime)

      // Store Long Task entry, which is a lightweight version of the PerformanceEntry
      instance.longTasks.push({
        id: getLongTaskId({ startClocks }),
        duration: entry.duration as Duration,
        entryType: entry.entryType,
        startClocks,
      })
    }
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState === 'hidden' && instance.state === 'running') {
      // Pause when tab is hidden. We use paused state to distinguish between
      // paused by visibility change and stopped by user.
      // If profiler is paused by the visibility change, we should resume when
      // tab becomes visible again. That's not the case when user stops the profiler.
      stopProfilerInstance('paused').catch(monitorError)
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

  function getLongTaskEntryType(): 'long-animation-frame' | 'longtask' {
    return isLongAnimationFrameEnabled ? 'long-animation-frame' : 'longtask'
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
