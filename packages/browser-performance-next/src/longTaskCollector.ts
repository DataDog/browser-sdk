import type { Pipeline } from '@datadog/core-next'

function startLongTaskCollection(pipeline: Pipeline<Record<string, unknown>>): () => void {
  if (typeof PerformanceObserver === 'undefined') {
    return () => {}
  }

  const observers: PerformanceObserver[] = []

  // Try long-animation-frame first (richer data)
  try {
    const lafObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        pipeline.publish('resource:long_animation_frame', entry)
      }
    })
    lafObserver.observe({ type: 'long-animation-frame', buffered: true })
    observers.push(lafObserver)
  } catch {
    // Fallback to longtask
    try {
      const ltObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          pipeline.publish('resource:long_task', entry)
        }
      })
      ltObserver.observe({ type: 'longtask', buffered: true })
      observers.push(ltObserver)
    } catch {
      // Neither supported
    }
  }

  return () => {
    for (const observer of observers) {
      observer.disconnect()
    }
  }
}

export { startLongTaskCollection }
