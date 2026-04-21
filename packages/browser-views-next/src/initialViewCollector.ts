import type { Pipeline } from '@datadog/core-next'
import type { NavigationResource } from './types'

function startInitialViewCollection(pipeline: Pipeline<Record<string, unknown>>): () => void {
  const resource: NavigationResource = {
    url: window.location.href,
    startTime: 0,
    startDate: Math.round(performance.timeOrigin),
    referrer: document.referrer,
    loadingType: 'initial_load',
  }
  pipeline.publish('resource:navigation', resource)

  return () => {
    // no-op: the initial view is a one-time event
  }
}

export { startInitialViewCollection }
