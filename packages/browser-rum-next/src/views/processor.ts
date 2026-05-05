import type { Pipeline } from '@datadog/core-next'
import type { ViewObservation, SerializedViewEvent, ViewChangedSignal, ViewLoadingType, EventCounts } from './types'
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
      publishSerializedView(currentView)
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

    publishSerializedView(currentView)
  }

  function publishSerializedView(view: ViewObservation): void {
    const clsMetric = view.cumulativeLayoutShift
    const lcpMetric = view.largestContentfulPaint
    const inpMetric = view.interactionToNextPaint
    const fcpValue = view.firstContentfulPaint
    const navTiming = view.navigationTimings
    const counts = view.eventCounts ?? createEmptyEventCounts()

    const event: SerializedViewEvent = {
      type: 'view',
      date: view.startDate,
      view: {
        id: view.id,
        name: view.name,
        url: view.url,
        referrer: view.referrer,
        loading_type: view.loadingType,
        is_active: view.isActive,
        time_spent: view.duration,
        // Flat navigation timings
        first_byte: navTiming?.firstByte,
        dom_interactive: navTiming?.domInteractive,
        dom_content_loaded: navTiming?.domContentLoaded,
        dom_complete: navTiming?.domComplete,
        load_event: navTiming?.loadEvent,
        // Flat web vitals
        first_contentful_paint: fcpValue,
        largest_contentful_paint: lcpMetric?.value,
        largest_contentful_paint_target_selector: lcpMetric?.targetSelector,
        cumulative_layout_shift: clsMetric?.value,
        cumulative_layout_shift_target_selector: clsMetric?.targetSelector,
        cumulative_layout_shift_time: clsMetric?.time,
        interaction_to_next_paint: inpMetric?.value,
        interaction_to_next_paint_target_selector: inpMetric?.targetSelector,
        interaction_to_next_paint_time: inpMetric?.time,
        loading_time: view.loadingTime,
        // Event counts
        error: { count: counts.errorCount },
        action: { count: counts.actionCount },
        resource: { count: counts.resourceCount },
        long_task: { count: counts.longTaskCount },
        frustration: { count: counts.frustrationCount },
      },
      _dd: {
        document_version: view.documentVersion,
        ...(clsMetric && { cls: { device_pixel_ratio: window.devicePixelRatio } }),
      },
    }

    // Performance detail sub-object
    const performance: SerializedViewEvent['performance'] = {}
    if (fcpValue !== undefined) {
      performance.fcp = { timestamp: fcpValue }
    }
    if (lcpMetric) {
      performance.lcp = {
        timestamp: lcpMetric.value,
        target_selector: lcpMetric.targetSelector,
        resource_url: lcpMetric.resourceUrl,
        ...(lcpMetric.subParts && {
          sub_parts: {
            load_delay: lcpMetric.subParts.loadDelay,
            load_time: lcpMetric.subParts.loadTime,
            render_delay: lcpMetric.subParts.renderDelay,
          },
        }),
      }
    }
    if (clsMetric) {
      performance.cls = {
        score: clsMetric.value,
        timestamp: clsMetric.time,
        target_selector: clsMetric.targetSelector,
        previous_rect: clsMetric.previousRect,
        current_rect: clsMetric.currentRect,
      }
    }
    if (inpMetric) {
      performance.inp = {
        duration: inpMetric.value,
        timestamp: inpMetric.time,
        target_selector: inpMetric.targetSelector,
        ...(inpMetric.subParts && {
          sub_parts: {
            input_delay: inpMetric.subParts.inputDelay,
            processing_duration: inpMetric.subParts.processingDuration,
            presentation_delay: inpMetric.subParts.presentationDelay,
          },
        }),
      }
    }
    if (Object.keys(performance).length > 0) {
      ;(event.view as any).performance = performance
    }

    // Scroll metrics go into display.scroll (matching v6 structure)
    const scrollMetrics = view.scroll
    if (scrollMetrics) {
      ;(event as any).display = {
        ...((event as any).display || {}),
        scroll: {
          max_depth: scrollMetrics.maxDepth,
          max_scroll_height: scrollMetrics.maxScrollHeight,
        },
      }
    }

    pipeline.publish('observation:view', event)
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
