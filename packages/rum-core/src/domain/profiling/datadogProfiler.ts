import { addEventListener, clearTimeout, setTimeout, DOM_EVENT, monitorError, display } from '@datadog/browser-core'
import { LifeCycleEventType } from '../lifeCycle'
import type {
  RumProfilerTrace,
  RumProfilerInstance,
  RumProfilerConfig,
  Profiler,
  RUMProfiler,
  RUMProfilerConfiguration,
} from './types'
import { getNumberOfSamples } from './utils/getNumberOfSamples'
import { disableLongTaskRegistry, enableLongTaskRegistry } from './utils/longTaskRegistry'
import { mayStoreLongTaskIdForProfilerCorrelation } from './profilingCorrelation'
import { transport } from './transport/transport'

// These APIs might be unavailable in some browsers
const globalThisProfiler: Profiler | undefined = (globalThis as any).Profiler

export const DEFAULT_RUM_PROFILER_CONFIGURATION: RUMProfilerConfiguration = {
  sampleIntervalMs: 10, // Sample stack trace every 10ms
  collectIntervalMs: 60000, // Collect data every minute
  minProfileDurationMs: 5000, // Require at least 5 seconds of profile data to reduce noise and cost
  minNumberOfSamples: 50, // Require at least 50 samples (~500 ms) to report a profile to reduce noise and cost
}

export function createRumProfiler({
  configuration,
  isLongAnimationFrameEnabled,
  lifeCycle,
  session,
  profilerConfiguration = DEFAULT_RUM_PROFILER_CONFIGURATION,
}: RumProfilerConfig): RUMProfiler {
  let observer: PerformanceObserver
  let instance: RumProfilerInstance = { state: 'stopped' }
  let cleanupTasks: Array<() => void> = []

  function start(viewId: string | undefined): void {
    if (instance.state === 'running') {
      return
    }

    // Reset clean-up tasks.
    cleanupTasks = []

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

      cleanupTasks.push(() => observer.disconnect())
      cleanupTasks.push(rawEventCollectedSubscription.unsubscribe)
    }

    cleanupTasks.push(
      addEventListener(configuration, window, DOM_EVENT.VISIBILITY_CHANGE, handleVisibilityChange).stop,
      addEventListener(configuration, window, DOM_EVENT.BEFORE_UNLOAD, handleBeforeUnload).stop
    )

    // Whenever the View is updated, we add a navigation entry to the profiler instance.
    const viewUpdatedSubscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (view) => {
      handleNavigate(view.id)
    })
    cleanupTasks.push(viewUpdatedSubscription.unsubscribe)

    // Add initial navigation entry
    handleNavigate(viewId)

    // Start profiler instance
    startNextProfilerInstance()
  }

  async function stop() {
    // Stop current profiler instance
    await stopProfilerInstance('stopped')

    // Cleanup tasks
    cleanupTasks.forEach((cleanupTask) => cleanupTask())

    // Disable Long Task Registry as we no longer need to correlate them with RUM
    disableLongTaskRegistry()
  }

  function startNextProfilerInstance(): void {
    if (!globalThisProfiler) {
      throw new Error('RUM Profiler is not supported in this browser.')
    }

    // Don't wait for data collection to start next instance
    collectProfilerInstance().catch(monitorError)

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
        '[DD_RUM] Failed to start the Profiler. Make sure your server is configured to send the `js-profiling` Response Header.',
        e
      )
      return
    }

    instance = {
      state: 'running',
      startTime: performance.now(),
      profiler,
      timeoutId: setTimeout(startNextProfilerInstance, profilerConfiguration.collectIntervalMs), // NodeJS types collision
      longTasks: [],
      navigation: [],
    }

    // Add event handler case we overflow the buffer
    profiler.addEventListener('samplebufferfull', handleSampleBufferFull)
  }

  async function collectProfilerInstance() {
    if (instance.state !== 'running') {
      return
    }

    // Empty the performance observer buffer
    handleEntries(observer.takeRecords())

    // Store instance data snapshot in local variables to use in async callback
    const { startTime, longTasks, navigation } = instance

    // Stop current profiler to get trace
    await instance.profiler
      .stop()
      .then((trace) => {
        const endTime = performance.now()

        if (endTime - startTime < profilerConfiguration.minProfileDurationMs) {
          // Skip very short profiles to reduce noise and cost
          return
        }

        if (getNumberOfSamples(trace.samples) < profilerConfiguration.minNumberOfSamples) {
          // Skip idle profiles to reduce noise and cost
          return
        }

        handleProfilerTrace(
          // Enrich trace with time and instance data
          Object.assign(trace, {
            startTime,
            endTime,
            timeOrigin: performance.timeOrigin,
            longTasks,
            navigation,
            sampleInterval: profilerConfiguration.sampleIntervalMs,
          })
        )
      })
      .catch(monitorError)

    // Cleanup instance
    clearTimeout(instance.timeoutId)
    instance.profiler.removeEventListener('samplebufferfull', handleSampleBufferFull)
  }

  async function stopProfilerInstance(nextState: 'paused' | 'stopped') {
    if (instance.state !== 'running') {
      return
    }

    await collectProfilerInstance()

    instance = { state: nextState }
  }

  function collectStartNavigationEntry(viewId: string | undefined): void {
    if (instance.state !== 'running') {
      return
    }

    // Add entry to navigation
    instance.navigation.push({
      startTime: performance.now(),
      viewId: viewId || '',
    })
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
    handleEntries(list.getEntries())
  }

  function handleEntries(entries: PerformanceEntryList): void {
    if (instance.state !== 'running') {
      return
    }

    for (const entry of entries) {
      if (entry.duration < profilerConfiguration.sampleIntervalMs) {
        // Skip entries shorter than sample interval to reduce noise and size of profile
        continue
      }

      switch (entry.entryType) {
        case getLongTaskEntryType():
          instance.longTasks.push(entry)
          break
      }
    }
  }

  function handleNavigate(viewId: string | undefined): void {
    collectStartNavigationEntry(viewId)
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
    stopProfilerInstance('stopped').catch(monitorError)
  }

  function getLongTaskEntryType(): 'long-animation-frame' | 'longtask' {
    return isLongAnimationFrameEnabled ? 'long-animation-frame' : 'longtask'
  }

  function isStopped() {
    return instance.state === 'stopped'
  }

  function isStarted() {
    return instance.state === 'running'
  }

  return { start, stop, isStopped, isStarted }
}
