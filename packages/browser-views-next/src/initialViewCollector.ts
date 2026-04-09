import type { Pipeline } from '@datadog/core-next'
import type { NavigationResource } from './types'

const initializedPipelines = new WeakSet<Pipeline<Record<string, unknown>>>()

function startInitialViewCollection(pipeline: Pipeline<Record<string, unknown>>): void {
  if (initializedPipelines.has(pipeline)) return
  initializedPipelines.add(pipeline)

  const resource: NavigationResource = {
    url: window.location.href,
    startTime: 0,
    startDate: Math.round(performance.timeOrigin),
    referrer: document.referrer,
    loadingType: 'initial_load',
  }
  pipeline.publish('resource:navigation', resource)
}

export { startInitialViewCollection }
