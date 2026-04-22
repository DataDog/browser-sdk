import type { Module, ModuleContext } from '@datadog/core-next'
import { ContextManager } from '@datadog/core-next'
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

interface RumPublicApi extends Record<string, unknown> {
  startView(name?: string): void
  addError(error: Error | string, context?: object): void
  getInternalContext(): Record<string, unknown>
  setGlobalContext(context: object): void
  getGlobalContext(): Record<string, unknown>
  setGlobalContextProperty(key: string, value: unknown): void
  removeGlobalContextProperty(key: string): void
  clearGlobalContext(): void
  setUser(user: object): void
  getUser(): Record<string, unknown>
  setUserProperty(key: string, value: unknown): void
  removeUserProperty(key: string): void
  clearUser(): void
  setAccount(account: object): void
  getAccount(): Record<string, unknown>
  setAccountProperty(key: string, value: unknown): void
  removeAccountProperty(key: string): void
  clearAccount(): void
}

const rumProcessor: Module = {
  name: 'rum',
  extension: rumExtension,
  init(context: ModuleContext): RumPublicApi {
    const config = (context.config as any).rum as RumConfig
    const globalContext = new ContextManager()
    const userContext = new ContextManager()
    const accountContext = new ContextManager()

    // Start performance collectors (resource timing + long tasks)
    const stopPerformanceCollectors = startPerformanceCollectors(context.pipeline)

    // Start view collectors (initial + navigation)
    const stopViewCollectors = startViewCollectors(context.pipeline)

    // Register navigation enricher (adds id UUID) on resource:navigation and action:start_view
    context.pipeline.enrich('resource:navigation', navigationEnricher())
    context.pipeline.enrich('action:start_view', navigationEnricher())

    // Start view processor (resource:navigation + action:start_view → observation:view + signal:view_changed)
    startViewProcessor({ pipeline: context.pipeline, globalContext, userContext, accountContext })

    // Register RUM enrichers on all observation:rum_* events
    context.pipeline.enrich('observation:rum_*', viewContextEnricher(context.pipeline))
    context.pipeline.enrich('observation:rum_*', displayEnricher())
    context.pipeline.enrich('observation:rum_*', connectivityEnricher())
    context.pipeline.enrich('observation:rum_*', pageStateEnricher())

    // Start the processor (subscribes to resources, transforms to observations)
    startProcessor({
      pipeline: context.pipeline,
      config,
      globalContext,
      userContext,
      accountContext,
    })

    return {
      __stop() {
        stopPerformanceCollectors()
        stopViewCollectors()
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
        context.pipeline.publish('observation:rum_error', {
          type: 'error',
          date: Date.now(),
          error: {
            message,
            type: errorObj?.name ?? 'Error',
            source: 'custom',
          },
          ...(errorContext ? { context: errorContext } : {}),
          ...globalContext.get(),
          usr: userContext.get(),
        })
      },

      getInternalContext() {
        return {
          ...globalContext.get(),
          usr: userContext.get(),
        }
      },

      setGlobalContext(ctx: object) {
        globalContext.set(ctx as Record<string, unknown>)
      },
      getGlobalContext() {
        return globalContext.get()
      },
      setGlobalContextProperty(key: string, value: unknown) {
        globalContext.setProperty(key as never, value as never)
      },
      removeGlobalContextProperty(key: string) {
        globalContext.removeProperty(key as never)
      },
      clearGlobalContext() {
        globalContext.clear()
      },

      setUser(user: object) {
        userContext.set(user as Record<string, unknown>)
      },
      getUser() {
        return userContext.get()
      },
      setUserProperty(key: string, value: unknown) {
        userContext.setProperty(key as never, value as never)
      },
      removeUserProperty(key: string) {
        userContext.removeProperty(key as never)
      },
      clearUser() {
        userContext.clear()
      },

      setAccount(account: object) {
        accountContext.set(account as Record<string, unknown>)
      },
      getAccount() {
        return accountContext.get()
      },
      setAccountProperty(key: string, value: unknown) {
        accountContext.setProperty(key as never, value as never)
      },
      removeAccountProperty(key: string) {
        accountContext.removeProperty(key as never)
      },
      clearAccount() {
        accountContext.clear()
      },
    }
  },
}

export { rumProcessor }
export type { RumPublicApi }
