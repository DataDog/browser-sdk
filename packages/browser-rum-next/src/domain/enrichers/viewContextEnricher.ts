import type { Pipeline } from '@datadog/core-next'
import { SKIP } from '@datadog/core-next'

function viewContextEnricher(pipeline: Pipeline<Record<string, unknown>>) {
  let currentViewId: string | undefined

  pipeline.subscribe('signal:view_changed', (data) => {
    currentViewId = (data as Record<string, unknown>).viewId as string
  })

  return {
    name: 'viewContext',
    transform(data: Record<string, unknown>) {
      if (!currentViewId) return SKIP
      return { ...data, view: { ...(data.view as object || {}), id: currentViewId } }
    },
  }
}

export { viewContextEnricher }
