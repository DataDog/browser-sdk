import type { Module, ModuleContext } from '@datadog/core-next'
import { rumExtension } from '../domain/configuration'
import type { RumConfig } from '../domain/configuration'
import { startProcessor } from '../domain/processor'
import { viewContextEnricher } from '../domain/enrichers/viewContextEnricher'
import { displayEnricher } from '../domain/enrichers/displayEnricher'
import { connectivityEnricher } from '../domain/enrichers/connectivityEnricher'
import { pageStateEnricher } from '../domain/enrichers/pageStateEnricher'
import { startViewCollectors } from '../views/collectors'
import { startCollectors as startPerformanceCollectors } from '../performance/collectors'
import { navigationEnricher } from '../views/navigationEnricher'
import { startProcessor as startViewProcessor } from '../views/processor'
import type { StartViewAction } from '../views/types'
import { startClickCollection } from '../actions/clickCollector'
import { startDomMutationCollection } from '../actions/domMutationCollector'
import { startActionProcessor } from '../actions/actionProcessor'

interface RumPublicApi extends Record<string, unknown> {
  startView(name?: string): void
  addError(error: Error | string, context?: object): void
  getInternalContext(): Record<string, unknown>
}

const rumProcessor: Module = {
  name: 'rum',
  extension: rumExtension,
  init(context: ModuleContext): RumPublicApi {
    const config = (context.config as any).rum as RumConfig

    // Start performance collectors (resource timing + long tasks)
    const stopPerformanceCollectors = startPerformanceCollectors(context.pipeline)

    // Start view collectors (initial + navigation)
    const stopViewCollectors = startViewCollectors(context.pipeline)

    // Start action collectors
    const stopClickCollection = startClickCollection(context.pipeline)
    const stopDomMutationCollection = startDomMutationCollection(context.pipeline)

    // Start action processor (click → observation:action, add_action → observation:action)
    startActionProcessor(context.pipeline)

    // Register navigation enricher (adds id UUID) on resource:navigation and action:start_view
    context.pipeline.enrich('resource:navigation', navigationEnricher())
    context.pipeline.enrich('action:start_view', navigationEnricher())

    // Start view processor (resource:navigation + action:start_view → observation:view + signal:view_changed)
    startViewProcessor({ pipeline: context.pipeline })

    // Register RUM enrichers on all observation:* events
    context.pipeline.enrich('observation:*', viewContextEnricher(context.pipeline))
    context.pipeline.enrich('observation:*', displayEnricher())
    context.pipeline.enrich('observation:*', connectivityEnricher())
    context.pipeline.enrich('observation:*', pageStateEnricher())

    // Register routes: all RUM observation types go to the 'rum' track
    context.transport.route('observation:view', 'rum')
    context.transport.route('observation:resource', 'rum')
    context.transport.route('observation:error', 'rum')
    context.transport.route('observation:long_task', 'rum')
    context.transport.route('observation:action', 'rum')

    // Start the processor (subscribes to resources, transforms to observations)
    startProcessor({
      pipeline: context.pipeline,
      config,
    })

    return {
      __stop() {
        stopPerformanceCollectors()
        stopViewCollectors()
        stopClickCollection()
        stopDomMutationCollection()
      },

      startView(name?: string) {
        const action: StartViewAction = {
          url: window.location.href,
          startTime: performance.now(),
          startDate: Date.now(),
          referrer: '',
          loadingType: 'route_change',
          name,
        }
        context.pipeline.publish('action:start_view', action)
      },

      addError(error: Error | string, errorContext?: object) {
        const errorObj = error instanceof Error ? error : undefined
        const message = error instanceof Error ? error.message : error
        context.pipeline.publish('observation:error', {
          type: 'error',
          date: Date.now(),
          error: {
            message,
            type: errorObj?.name ?? 'Error',
            source: 'custom',
          },
          ...(errorContext ? { context: errorContext } : {}),
        })
      },

      getInternalContext() {
        return {}
      },
    }
  },
}

export { rumProcessor }
export type { RumPublicApi }
