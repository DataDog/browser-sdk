import { SKIP } from '@datadog/core-next'

interface ViewContext {
  id?: string
  name?: string
}

function viewContextEnricher(ctx: ViewContext) {
  return {
    name: 'viewContext',
    transform(data: Record<string, unknown>) {
      if (!ctx.id) return SKIP
      return { ...data, view: { ...(data.view as object || {}), id: ctx.id, name: ctx.name } }
    },
  }
}

export { viewContextEnricher }
export type { ViewContext }
