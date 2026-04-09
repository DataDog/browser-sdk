import type { Module, ModuleContext } from '@datadog/core-next'
import { navigationEnricher } from '../navigationEnricher'
import { startProcessor } from '../domain/processor'
import type { StartViewAction } from '../types'

interface ViewsPublicApi extends Record<string, unknown> {
  startView(name?: string): void
}

const viewsProcessor: Module = {
  name: 'views',
  extension: {
    key: 'views',
    validate: () => ({}),
  },
  init(context: ModuleContext): ViewsPublicApi {
    // Register enricher on both resource:navigation and action:start_view
    // (no-op if pipeline is already sealed, e.g. in tests)
    try {
      context.pipeline.enrich('resource:navigation', navigationEnricher())
      context.pipeline.enrich('action:start_view', navigationEnricher())
    } catch {
      // enrichers cannot be added after seal; skip gracefully
    }

    // Start processor (resource:navigation + action:start_view → observation:view + signal:view_changed)
    startProcessor(context.pipeline)

    function handleStartView(name?: string): void {
      const action: StartViewAction = {
        url: window.location.href,
        startTime: performance.now(),
        startDate: Date.now(),
        referrer: '',
        loadingType: 'route_change',
        name,
      }
      context.pipeline.publish('action:start_view', action)
    }

    return {
      startView(name?: string) {
        handleStartView(name)
      },
    }
  },
}

export { viewsProcessor }
export type { ViewsPublicApi }
