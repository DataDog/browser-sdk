import type { Pipeline } from '@datadog/core-next'
import type { ViewObservation, ViewChangedSignal } from '../types'

function publishView(pipeline: Pipeline<Record<string, unknown>>, data: Record<string, unknown>): void {
  const viewId = data.id as string
  const observation: ViewObservation = {
    id: viewId,
    url: data.url as string,
    referrer: data.referrer as string,
    loadingType: data.loadingType as ViewObservation['loadingType'],
    startTime: data.startTime as number,
    startDate: data.startDate as number,
    name: data.name as string | undefined,
  }
  const signal: ViewChangedSignal = { viewId }

  pipeline.publish('observation:view', observation)
  pipeline.publish('signal:view_changed', signal)
}

function startProcessor(pipeline: Pipeline<Record<string, unknown>>): void {
  pipeline.subscribe('resource:navigation', (data) => {
    publishView(pipeline, data as Record<string, unknown>)
  })

  pipeline.subscribe('action:start_view', (data) => {
    publishView(pipeline, data as Record<string, unknown>)
  })
}

export { startProcessor }
