import type { Pipeline } from '@datadog/core-next'

function startPerformanceCollection(pipeline: Pipeline<Record<string, unknown>>): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => {}

  const observers: PerformanceObserver[] = []

  function observe(type: string, eventType: string, options?: Record<string, unknown>): void {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          pipeline.publish(eventType, entry)
        }
      })
      observer.observe({ type, buffered: true, ...options } as PerformanceObserverInit)
      observers.push(observer)
    } catch {
      // Entry type not supported in this browser
    }
  }

  observe('resource', 'resource:performance_entry')
  observe('paint', 'resource:paint')
  observe('largest-contentful-paint', 'resource:largest_contentful_paint')
  observe('layout-shift', 'resource:layout_shift')
  observe('event', 'resource:performance_event', { durationThreshold: 40 })
  observe('first-input', 'resource:first_input')
  observe('navigation', 'resource:navigation_timing')

  // Long tasks: prefer long-animation-frame, fall back to longtask
  try {
    const lafObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        pipeline.publish('resource:long_animation_frame', entry)
      }
    })
    lafObserver.observe({ type: 'long-animation-frame', buffered: true })
    observers.push(lafObserver)
  } catch {
    observe('longtask', 'resource:long_task')
  }

  return () => {
    for (const observer of observers) observer.disconnect()
  }
}

export { startPerformanceCollection }
