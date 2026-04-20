import type { Duration, Encoder } from '@datadog/browser-core'
import {
  addEventListener,
  clearTimeout,
  setTimeout,
  DOM_EVENT,
  DeflateEncoderStreamId,
  toServerDuration,
  clocksNow,
} from '@datadog/browser-core'
import type { LifeCycle, RumConfiguration, RumSessionManager, TransportPayload, ViewHistory } from '@datadog/browser-rum-core'
import { createFormDataTransport, LifeCycleEventType } from '@datadog/browser-rum-core'
import type { ReactProfileEvent } from '../types/reactProfiling'
import type { ReactProfileTrace } from '../types/reactProfileTrace'

export interface ComponentRenderData {
  component: string
  startTime: number
  duration: Duration
  phase: 'mount' | 'update' | 'nested-update'
  renderPhaseDuration?: Duration
  layoutEffectPhaseDuration?: Duration
  effectPhaseDuration?: Duration
  baseDurationMs?: number
}

export interface ReactProfilingController {
  start(): void
  stop(): void
  isRunning(): boolean
  isStopped(): boolean
  addComponentRender(data: ComponentRenderData): void
}

export interface ReactProfilerConfiguration {
  collectIntervalMs: number
}

export const DEFAULT_REACT_PROFILER_CONFIGURATION: ReactProfilerConfiguration = {
  collectIntervalMs: 60_000,
}

interface ReactProfilerRunningInstance {
  state: 'running'
  startTimeStamp: number
  timeoutId: ReturnType<typeof setTimeout>
  views: Array<{ id: string; name: string }>
  pendingBatchRenders: ComponentRenderData[]
  batchFlushScheduled: boolean
  samples: ReactProfileTrace['samples']
  cleanupTasks: Array<() => void>
}

interface ReactProfilerStoppedInstance {
  state: 'stopped'
  stateReason: 'initializing' | 'session-expired' | 'stopped-by-user'
}

interface ReactProfilerPausedInstance {
  state: 'paused'
}

type ReactProfilerInstance = ReactProfilerRunningInstance | ReactProfilerStoppedInstance | ReactProfilerPausedInstance

export function createReactProfiler(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  sessionManager: RumSessionManager,
  createEncoder: (streamId: DeflateEncoderStreamId) => Encoder,
  viewHistory: ViewHistory,
  profilerConfiguration: ReactProfilerConfiguration = DEFAULT_REACT_PROFILER_CONFIGURATION
): ReactProfilingController {
  const transport = createFormDataTransport(
    configuration,
    lifeCycle,
    createEncoder,
    DeflateEncoderStreamId.REACT_PROFILING
  )

  let instance: ReactProfilerInstance = { state: 'stopped', stateReason: 'initializing' }
  let lastView: { id: string; name: string } | undefined

  // Store clean-up tasks for this instance (tasks to be executed when the Profiler is stopped or paused.)
  const globalCleanupTasks: Array<() => void> = []

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

  function start(): void {
    if (instance.state === 'running') {
      return
    }

    const viewEntry = viewHistory.findView()
    lastView = viewEntry ? { id: viewEntry.id, name: viewEntry.name ?? '' } : undefined

    globalCleanupTasks.push(
      addEventListener(configuration, window, DOM_EVENT.VISIBILITY_CHANGE, handleVisibilityChange).stop,
      addEventListener(configuration, window, DOM_EVENT.BEFORE_UNLOAD, handleBeforeUnload).stop
    )

    startNextWindow()
  }

  function addEventListeners(existingInstance: ReactProfilerInstance) {
    if (existingInstance.state === 'running') {
      return { cleanupTasks: existingInstance.cleanupTasks }
    }

    const cleanupTasks = []

    const subscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (view) => {
      const viewEntry = { id: view.id, name: view.name ?? '' }
      if (instance.state === 'running') {
        instance.views.push(viewEntry)
      }
      lastView = viewEntry
    })
    cleanupTasks.push(subscription.unsubscribe)

    return { cleanupTasks }
  }

  function startNextWindow(): void {
    if (instance.state === 'running') {
      collectAndSendWindow(instance)
    }

    const { cleanupTasks } = addEventListeners(instance)

    instance = {
      state: 'running',
      startTimeStamp: clocksNow().timeStamp,
      timeoutId: setTimeout(startNextWindow, profilerConfiguration.collectIntervalMs),
      views: lastView ? [lastView] : [],
      pendingBatchRenders: [],
      batchFlushScheduled: false,
      samples: [],
      cleanupTasks,
    }
  }

  function collectAndSendWindow(runningInstance: ReactProfilerRunningInstance): void {
    clearTimeout(runningInstance.timeoutId)

    // Synchronously flush any pending batch renders before collecting
    if (runningInstance.pendingBatchRenders.length > 0) {
      flushBatch(runningInstance)
    }

    const { samples, views, startTimeStamp } = runningInstance
    if (samples.length === 0) {
      return
    }

    const sessionId = sessionManager.findTrackedSession()?.id

    const event: ReactProfileEvent = {
      application: { id: configuration.applicationId },
      ...(sessionId && { session: { id: sessionId } }),
      ...(views.length > 0 && {
        view: {
          id: views.map((v) => v.id),
          name: views.map((v) => v.name),
        },
      }),
      start: new Date(startTimeStamp).toISOString(),
      end: new Date().toISOString(),
      attachments: ['react-profiling.json'],
    }

    void transport.send({ event, 'react-profiling.json': { samples } } as unknown as TransportPayload)
  }

  function stopProfiling(reason: ReactProfilerStoppedInstance['stateReason']): void {
    if (instance.state === 'running') {
      const runningInstance = instance
      instance = { state: 'stopped', stateReason: reason }
      runningInstance.cleanupTasks.forEach((task) => task())
      collectAndSendWindow(runningInstance)
    } else if (instance.state === 'paused') {
      instance = { state: 'stopped', stateReason: reason }
    }

    globalCleanupTasks.forEach((task) => task())
    globalCleanupTasks.length = 0
  }

  function pauseProfilerInstance(): void {
    if (instance.state !== 'running') {
      return
    }

    const runningInstance = instance
    instance = { state: 'paused' }
    runningInstance.cleanupTasks.forEach((task) => task())
    collectAndSendWindow(runningInstance)
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState === 'hidden' && instance.state === 'running') {
      pauseProfilerInstance()
    } else if (document.visibilityState === 'visible' && instance.state === 'paused') {
      start()
    }
  }

  function handleBeforeUnload(): void {
    startNextWindow()
  }

  function addComponentRender(data: ComponentRenderData): void {
    if (instance.state !== 'running') {
      return
    }

    instance.pendingBatchRenders.push(data)

    if (!instance.batchFlushScheduled) {
      instance.batchFlushScheduled = true
      // React runs all useEffect callbacks from a single commit synchronously in the same
      // MessageChannel task, so a microtask scheduled from the first effect fires after all
      // of them — letting us group them into one sample.
      queueMicrotask(() => {
        if (instance.state === 'running') {
          flushBatch(instance)
        }
      })
    }
  }

  function flushBatch(runningInstance: ReactProfilerRunningInstance): void {
    runningInstance.batchFlushScheduled = false

    if (runningInstance.pendingBatchRenders.length === 0) {
      return
    }

    const renders = runningInstance.pendingBatchRenders
    runningInstance.pendingBatchRenders = []

    const sampleTimestampMs = Math.min(...renders.map((r) => r.startTime))

    runningInstance.samples.push({
      timestamp: new Date(sampleTimestampMs).toISOString(),
      renders: renders.map((r) => ({
        component: r.component,
        phase: r.phase,
        duration: toServerDuration(r.duration),
        ...(r.renderPhaseDuration !== undefined && {
          render_phase_duration: toServerDuration(r.renderPhaseDuration),
        }),
        ...(r.layoutEffectPhaseDuration !== undefined && {
          layout_effect_phase_duration: toServerDuration(r.layoutEffectPhaseDuration),
        }),
        ...(r.effectPhaseDuration !== undefined && {
          effect_phase_duration: toServerDuration(r.effectPhaseDuration),
        }),
        ...(r.baseDurationMs !== undefined && {
          base_duration: toServerDuration(r.baseDurationMs as Duration),
        }),
      })),
    })
  }

  return {
    start,
    stop: () => stopProfiling('stopped-by-user'),
    addComponentRender,
    isRunning: () => instance.state === 'running',
    isStopped: () => instance.state === 'stopped',
  }
}
