import type { Pipeline, ContextManager } from '@datadog/core-next'
import type { ViewObservation, ViewChangedSignal } from './types'

interface ProcessorDependencies {
  pipeline: Pipeline<Record<string, unknown>>
  globalContext: ContextManager
  userContext: ContextManager
  accountContext: ContextManager
}

function startProcessor({ pipeline, globalContext, userContext, accountContext }: ProcessorDependencies): void {
  function publishView(data: Record<string, unknown>): void {
    const viewId = data.id as string
    const startDate = data.startDate as number
    const accountCtx = accountContext.get()
    const hasAccount = Object.keys(accountCtx).length > 0

    const observation: ViewObservation = {
      id: viewId,
      url: data.url as string,
      referrer: data.referrer as string,
      loadingType: data.loadingType as ViewObservation['loadingType'],
      startTime: data.startTime as number,
      startDate,
      date: startDate, // consumed by metadataEnricher so it doesn't fall back to Date.now()
      name: data.name as string | undefined,
      ...globalContext.get(),
      usr: userContext.get(),
      ...(hasAccount && { account: accountCtx }),
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
