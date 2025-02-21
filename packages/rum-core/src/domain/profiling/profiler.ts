import { addEventListener, clearTimeout, setTimeout, DOM_EVENT } from '@datadog/browser-core'
import { LifeCycleEventType } from '../lifeCycle'
import { exportToJSONIntake } from './exporter/exportToJsonIntake'
import type { RumProfilerTrace, RumProfilerInstance, RumProfilerConfig, Profiler } from './types'
import { getNumberOfSamples } from './utils/getNumberOfSamples'
import { disableLongTaskRegistry, enableLongTaskRegistry } from './utils/longTaskRegistry'
import { mayStoreLongTaskIdForProfilerCorrelation } from './profilingCorrelation'

// These APIs might be unavailable in some browsers
const globalThisProfiler: Profiler | undefined = (globalThis as any).Profiler

const SAMPLE_INTERVAL_MS = 10 // Sample stack trace every 10ms
const COLLECT_INTERVAL_MS = 60000 // Collect data every minute
const MIN_PROFILE_DURATION_MS = 5000 // Require at least 5 seconds of profile data to reduce noise and cost
const MIN_NUMBER_OF_SAMPLES = 50 // Require at least 50 samples (~500 ms) to report a profile to reduce noise and cost

export function createRumProfiler({
  configuration,
  endpointBuilder,
  isLongAnimationFrameEnabled,
  lifeCycle,
  session,
}: RumProfilerConfig) {
  let observer: PerformanceObserver
  let instance: RumProfilerInstance = { state: 'stopped' }
  let cleanupTasks: Array<() => void> = []
  let applicationId: string

  function supported(): boolean {
    return globalThisProfiler !== undefined
  }

  function start(viewId: string | undefined): void {
    if (instance.state === 'running') {
      return
    }
    applicationId = configuration.applicationId

    // Setup event listeners
    observer = new PerformanceObserver(handlePerformance)
    observer.observe({
      entryTypes: [getLongTaskEntryType(), 'measure', 'event'],
    })

    cleanupTasks = [
      () => observer.disconnect(),
      addEventListener(configuration, window, DOM_EVENT.VISIBILITY_CHANGE, handleVisibilityChange).stop,
      addEventListener(configuration, window, DOM_EVENT.BEFORE_UNLOAD, handleBeforeUnload).stop,
    ]

    // Whenever an Event is collected, when it's a Long Task, we may store the long task id for profiler correlation.
    const rawEventCollectedSubscription = lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (data) => {
      mayStoreLongTaskIdForProfilerCorrelation(data)
    })
    cleanupTasks.push(rawEventCollectedSubscription.unsubscribe)

    // Whenever the View is updated, we add a navigation entry to the profiler instance.
    const viewUpdatedSubscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (view) => {
      handleNavigate(view.id)
    })
    cleanupTasks.push(viewUpdatedSubscription.unsubscribe)

    // Add initial navigation entry
    handleNavigate(viewId)

    // Start profiler instance
    startNextProfilerInstance()

    // Enable Long Task registry so we can correlate them with RUM
    enableLongTaskRegistry()
  }

  function stop(): void {
    // Stop current profiler instance
    stopProfilerInstance('stopped')

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
    collectProfilerInstance()

    const profiler = new globalThisProfiler({
      sampleInterval: SAMPLE_INTERVAL_MS,
      // Keep buffer size at 1.5 times of minimum required to collect data for a profiling instance
      maxBufferSize: Math.round((COLLECT_INTERVAL_MS * 1.5) / SAMPLE_INTERVAL_MS),
    })

    instance = {
      state: 'running',
      startTime: performance.now(),
      // We have to create new Profiler instance for each instance
      profiler,
      timeoutId: setTimeout(startNextProfilerInstance, COLLECT_INTERVAL_MS), // NodeJS types collision
      longTasks: [],
      measures: [],
      events: [],
      navigation: [],
    }

    // Add event handler case we overflow the buffer
    profiler.addEventListener('samplebufferfull', handleSampleBufferFull)
  }

  function collectProfilerInstance(): void {
    if (instance.state !== 'running') {
      return
    }

    // Empty the performance observer buffer
    handleEntries(observer.takeRecords())

    // Store instance data snapshot in local variables to use in async callback
    const { startTime, longTasks, measures, events, navigation } = instance

    // Stop current profiler to get trace
    instance.profiler
      .stop()
      .then((trace) => {
        const endTime = performance.now()

        if (endTime - startTime < MIN_PROFILE_DURATION_MS) {
          // Skip very short profiles to reduce noise and cost
          return
        }

        if (getNumberOfSamples(trace.samples) < MIN_NUMBER_OF_SAMPLES) {
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
            measures,
            events,
            navigation,
            sampleInterval: SAMPLE_INTERVAL_MS,
          })
        )
      })
      .catch(() => undefined)

    // Cleanup instance
    clearTimeout(instance.timeoutId)
    instance.profiler.removeEventListener('samplebufferfull', handleSampleBufferFull)
  }

  function stopProfilerInstance(nextState: 'paused' | 'stopped') {
    if (instance.state !== 'running') {
      return
    }

    collectProfilerInstance()
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
    exportToJSONIntake(trace, endpointBuilder, applicationId, sessionId, configuration.site).catch(() => undefined)
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
      if (entry.duration < SAMPLE_INTERVAL_MS) {
        // Skip entries shorter than sample interval to reduce noise and size of profile
        continue
      }

      switch (entry.entryType) {
        case getLongTaskEntryType():
          instance.longTasks.push(entry)
          break
        case 'measure':
          instance.measures.push(entry as PerformanceMeasure)
          break
        case 'event':
          instance.events.push(entry as PerformanceEventTiming)
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
      stopProfilerInstance('paused')
    } else if (document.visibilityState === 'visible' && instance.state === 'paused') {
      // Resume when tab becomes visible again
      startNextProfilerInstance()
    }
  }

  function handleBeforeUnload(): void {
    stopProfilerInstance('stopped')
  }

  function getLongTaskEntryType(): 'long-animation-frame' | 'longtask' {
    return isLongAnimationFrameEnabled ? 'long-animation-frame' : 'longtask'
  }

  return { start, stop, supported }
}
