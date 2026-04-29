import type { Pipeline } from '@datadog/core-next'
import type { ViewObservation, ViewChangedSignal, ViewLoadingType, EventCounts } from './types'
import { trackCls } from './metrics/trackCls'
import { trackFcp } from './metrics/trackFcp'
import { trackLcp } from './metrics/trackLcp'
import { trackInp } from './metrics/trackInp'
import { trackNavigationTimings } from './metrics/trackNavigationTimings'
import { trackLoadingTime } from './metrics/trackLoadingTime'
import { trackScroll } from './metrics/trackScroll'
import { trackBfcache } from './metrics/trackBfcache'
import type { LoadingTimeTracker } from './metrics/trackLoadingTime'
import type { ScrollTracker } from './metrics/trackScroll'
import type { BfcacheTracker } from './metrics/trackBfcache'

interface ProcessorDependencies {
  pipeline: Pipeline<Record<string, unknown>>
}

let viewIdCounter = 0
function generateViewId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `view-${++viewIdCounter}-${Date.now()}`
}

function createEmptyEventCounts(): EventCounts {
  return { actionCount: 0, errorCount: 0, resourceCount: 0, longTaskCount: 0, frustrationCount: 0 }
}

function startProcessor({ pipeline }: ProcessorDependencies): void {
  let currentView: ViewObservation | undefined
  let cls = trackCls()
  let fcp = trackFcp()
  let lcp = trackLcp()
  let inp = trackInp()
  let navTimings = trackNavigationTimings()
  let loadingTime: LoadingTimeTracker = trackLoadingTime('initial_load')
  let scroll: ScrollTracker = trackScroll()
  let bfcache: BfcacheTracker | undefined
  let eventCounts = createEmptyEventCounts()

  function createView(data: Record<string, unknown>): void {
    // Finalize previous view
    if (currentView) {
      scroll.stop()
      currentView.isActive = false
      currentView.duration = performance.now() - currentView.startTime
      currentView.documentVersion++
      pipeline.publish('observation:view', { ...currentView })
    }

    // Reset trackers
    cls = trackCls()
    fcp = trackFcp()
    lcp = trackLcp()
    inp = trackInp()
    navTimings = trackNavigationTimings()
    loadingTime = trackLoadingTime(data.loadingType as ViewLoadingType)
    scroll = trackScroll()
    bfcache = undefined
    eventCounts = createEmptyEventCounts()

    const loadingType = data.loadingType as ViewLoadingType
    const startTime = data.startTime as number

    if (loadingType === 'bf_cache') {
      bfcache = trackBfcache(startTime)
    }

    scroll.start()

    currentView = {
      id: (data.id as string) || generateViewId(),
      url: data.url as string,
      referrer: data.referrer as string,
      loadingType,
      startTime,
      startDate: data.startDate as number,
      date: data.startDate as number,
      name: data.name as string | undefined,
      duration: 0,
      documentVersion: 0,
      isActive: true,
    }

    publishUpdate()
    pipeline.publish('signal:view_changed', { viewId: currentView.id } as ViewChangedSignal)
  }

  function publishUpdate(): void {
    if (!currentView) return

    currentView.duration = performance.now() - currentView.startTime
    currentView.documentVersion++

    // Collect current metric values
    currentView.cumulativeLayoutShift = cls.get()
    currentView.interactionToNextPaint = inp.get()
    currentView.eventCounts = { ...eventCounts }
    currentView.loadingTime = loadingTime.get()
    currentView.scroll = scroll.get()

    if (currentView.loadingType === 'bf_cache' && bfcache) {
      const bfMetrics = bfcache.get()
      if (bfMetrics) {
        currentView.firstContentfulPaint = bfMetrics.firstContentfulPaint
        currentView.largestContentfulPaint = bfMetrics.largestContentfulPaint
      }
    } else if (currentView.loadingType === 'initial_load') {
      currentView.firstContentfulPaint = fcp.get()
      currentView.largestContentfulPaint = lcp.get()
      currentView.navigationTimings = navTimings.get()
    }

    pipeline.publish('observation:view', { ...currentView })
  }

  // Navigation events → new view
  pipeline.subscribe('resource:navigation', (data) => {
    createView(data as Record<string, unknown>)
  })

  pipeline.subscribe('action:start_view', (data) => {
    createView(data as Record<string, unknown>)
  })

  // Metric events → accumulate + publish update
  pipeline.subscribe('resource:paint', (data) => {
    const entry = data as { name: string; startTime: number }
    if (entry.name !== 'first-contentful-paint') return
    if (!currentView || currentView.loadingType !== 'initial_load') return
    fcp.process(entry)
    publishUpdate()
  })

  pipeline.subscribe('resource:largest_contentful_paint', (data) => {
    if (!currentView || currentView.loadingType !== 'initial_load') return
    lcp.process(data as any)
    publishUpdate()
  })

  pipeline.subscribe('resource:layout_shift', (data) => {
    const entry = data as { value: number; hadRecentInput: boolean; startTime: number; sources?: any[] }
    if (entry.hadRecentInput) return
    cls.process(entry)
    publishUpdate()
  })

  pipeline.subscribe('resource:performance_event', (data) => {
    inp.process(data as any)
    lcp.stop() // First interaction stops LCP tracking
    publishUpdate()
  })

  pipeline.subscribe('resource:first_input', (data) => {
    inp.process(data as any)
    lcp.stop()
    publishUpdate()
  })

  pipeline.subscribe('resource:navigation_timing', (data) => {
    if (!currentView || currentView.loadingType !== 'initial_load') return
    const timing = data as { loadEventEnd?: number }
    if (timing.loadEventEnd !== undefined) {
      loadingTime.setLoadEvent(timing.loadEventEnd)
    }
    navTimings.process(data as any)
    publishUpdate()
  })

  // Event count subscriptions
  pipeline.subscribe('observation:action', (data) => {
    eventCounts.actionCount++
    const action = (data as Record<string, unknown>).action as Record<string, unknown> | undefined
    const frustration = action?.frustration as { type: string[] } | undefined
    if (frustration && frustration.type.length > 0) {
      eventCounts.frustrationCount++
    }
    publishUpdate()
  })

  pipeline.subscribe('observation:error', () => {
    eventCounts.errorCount++
    publishUpdate()
  })

  pipeline.subscribe('observation:resource', () => {
    eventCounts.resourceCount++
    publishUpdate()
  })

  pipeline.subscribe('observation:long_task', () => {
    eventCounts.longTaskCount++
    publishUpdate()
  })
}

export { startProcessor }
export type { ProcessorDependencies }
