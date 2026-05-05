import type { Module, ModuleContext } from '@datadog/core-next'
import { createIdentifier, enricher } from '@datadog/core-next'
import { rumExtension } from '../domain/configuration'
import type { RumConfig } from '../domain/configuration'
import { startProcessor } from '../domain/processor'
import { viewContextEnricher } from '../domain/enrichers/viewContextEnricher'
import type { ViewContext } from '../domain/enrichers/viewContextEnricher'
import { displayEnricher } from '../domain/enrichers/displayEnricher'
import { connectivityEnricher } from '../domain/enrichers/connectivityEnricher'
import { pageStateEnricher } from '../domain/enrichers/pageStateEnricher'
import { urlContextsEnricher } from '../domain/enrichers/urlContextsEnricher'
import { featureFlagEnricher } from '../domain/enrichers/featureFlagEnricher'
import { syntheticsEnricher } from '../domain/enrichers/syntheticsEnricher'
import { ciVisibilityEnricher } from '../domain/enrichers/ciVisibilityEnricher'
import { sourceCodeEnricher } from '../domain/enrichers/sourceCodeEnricher'
import { deviceEnricher } from '../domain/enrichers/deviceEnricher'
import { tabEnricher } from '../domain/enrichers/tabEnricher'
import { startViewCollectors } from '../views/collectors'
import { startCollectors as startPerformanceCollectors } from '../performance/collectors'
import { navigationEnricher } from '../views/navigationEnricher'
import { startProcessor as startViewProcessor } from '../views/processor'
import type { StartViewAction } from '../views/types'
import { startClickCollection } from '../actions/clickCollector'
import { startDomMutationCollection } from '../actions/domMutationCollector'
import { startActionProcessor } from '../actions/actionProcessor'
import { actionContextEnricher } from '../domain/enrichers/actionContextEnricher'
import { getDocumentTraceId } from '../domain/getDocumentTraceId'
import { startVitalProcessor } from '../domain/vitals'
import { startManualResourceProcessor } from '../domain/manualResource'

interface RumPublicApi extends Record<string, unknown> {
  startView(name?: string): void
  addError(error: Error | string, context?: object): void
  addFeatureFlagEvaluation(key: string, value: unknown): void
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
    const actionContexts = startActionProcessor(context.pipeline)

    // Stamp action.id on error/resource/long_task events when an action is active
    context.pipeline.enrich('observation:error', actionContextEnricher(actionContexts))
    context.pipeline.enrich('observation:resource', actionContextEnricher(actionContexts))
    context.pipeline.enrich('observation:long_task', actionContextEnricher(actionContexts))

    // Start vital processor (start_vital + stop_vital + add_vital → observation:vital)
    startVitalProcessor(context.pipeline)

    // Start manual resource processor (start_resource + stop_resource → observation:resource)
    startManualResourceProcessor(context.pipeline)

    // Register navigation enricher (adds id UUID) on resource:navigation and action:start_view
    context.pipeline.enrich('resource:navigation', navigationEnricher())
    context.pipeline.enrich('action:start_view', navigationEnricher())

    // Start view processor (resource:navigation + action:start_view → observation:view + signal:view_changed)
    startViewProcessor({ pipeline: context.pipeline })

    // Track current view context from signal:view_changed
    const viewContext: ViewContext = {}
    context.pipeline.subscribe('signal:view_changed', (data) => {
      const signal = data as { viewId: string; viewName?: string }
      viewContext.id = signal.viewId
      viewContext.name = signal.viewName
    })

    // Register RUM enrichers on all observation:* events
    context.pipeline.enrich('observation:view', deviceEnricher())
    context.pipeline.enrich('observation:*', tabEnricher())
    context.pipeline.enrich('observation:*', viewContextEnricher(viewContext))
    context.pipeline.enrich('observation:*', displayEnricher())
    context.pipeline.enrich('observation:*', connectivityEnricher())
    context.pipeline.enrich('observation:view', pageStateEnricher())
    context.pipeline.enrich('observation:*', urlContextsEnricher())

    // Feature flags
    const featureFlags = featureFlagEnricher()
    context.pipeline.enrich('observation:*', featureFlags.enricher)
    context.pipeline.subscribe('action:add_feature_flag', (data) => {
      const flag = data as { key: string; value: unknown }
      featureFlags.addEvaluation(flag.key, flag.value)
    })

    // Synthetics and CI visibility
    context.pipeline.enrich('observation:*', syntheticsEnricher())
    context.pipeline.enrich('observation:*', ciVisibilityEnricher())

    // Source code (error events only)
    context.pipeline.enrich('observation:error', sourceCodeEnricher())

    // Register routes: all RUM observation types go to the 'rum' track
    context.transport.routeWithDedup('observation:view', 'rum', (event) => (event.view as any)?.id ?? 'unknown')
    context.transport.route('observation:resource', 'rum')
    context.transport.route('observation:error', 'rum')
    context.transport.route('observation:long_task', 'rum')
    context.transport.route('observation:action', 'rum')
    context.transport.route('observation:vital', 'rum')

    // Start the processor (subscribes to resources, transforms to observations)
    startProcessor({
      pipeline: context.pipeline,
      config,
    })

    // Wire document trace ID into the initial navigation resource
    const documentTraceId = getDocumentTraceId(document)
    if (documentTraceId) {
      let applied = false
      context.pipeline.enrich(
        'observation:resource',
        enricher({
          name: 'documentTrace',
          transform: (data: Record<string, unknown>) => {
            if (applied) return data
            const resource = data.resource as Record<string, unknown> | undefined
            if (resource?.initiatorType === 'navigation' || resource?.url === window.location.href) {
              applied = true
              return {
                ...data,
                _dd: {
                  ...((data._dd as Record<string, unknown>) || {}),
                  trace_id: documentTraceId,
                  span_id: createIdentifier(63).toString(10),
                },
              }
            }
            return data
          },
        })
      )
    }

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

      addFeatureFlagEvaluation(key: string, value: unknown) {
        context.pipeline.publish('action:add_feature_flag', { key, value })
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
