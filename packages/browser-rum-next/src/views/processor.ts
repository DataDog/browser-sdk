import type { Pipeline } from '@datadog/core-next'
import type { ViewObservation, ViewChangedSignal } from './types'

interface ProcessorDependencies {
  pipeline: Pipeline<Record<string, unknown>>
}

function startProcessor({ pipeline }: ProcessorDependencies): void {
  function publishView(data: Record<string, unknown>): void {
    const viewId = data.id as string
    const startDate = data.startDate as number

    const observation: ViewObservation = {
      id: viewId,
      url: data.url as string,
      referrer: data.referrer as string,
      loadingType: data.loadingType as ViewObservation['loadingType'],
      startTime: data.startTime as number,
      startDate,
      date: startDate, // consumed by metadataEnricher so it doesn't fall back to Date.now()
      name: data.name as string | undefined,
    }
    const signal: ViewChangedSignal = { viewId }

    pipeline.publish('observation:view', observation)
    pipeline.publish('signal:view_changed', signal)
  }

  pipeline.subscribe('resource:navigation', (data) => {
    publishView(data as Record<string, unknown>)
  })

  pipeline.subscribe('action:start_view', (data) => {
    publishView(data as Record<string, unknown>)
  })
}

export { startProcessor }
export type { ProcessorDependencies }
