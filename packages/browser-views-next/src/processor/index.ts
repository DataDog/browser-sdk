import type { Module, ModuleContext } from '@datadog/core-next'
import { ContextManager } from '@datadog/core-next'
import { navigationEnricher } from '../navigationEnricher'
import { startProcessor } from '../domain/processor'
import type { StartViewAction } from '../types'

interface ViewsPublicApi extends Record<string, unknown> {
  startView(name?: string): void
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

const viewsProcessor: Module = {
  name: 'views',
  extension: {
    key: 'views',
    validate: () => ({}),
  },
  init(context: ModuleContext): ViewsPublicApi {
    const globalContext = new ContextManager()
    const userContext = new ContextManager()
    const accountContext = new ContextManager()

    // Register enricher on both resource:navigation and action:start_view
    context.pipeline.enrich('resource:navigation', navigationEnricher())
    context.pipeline.enrich('action:start_view', navigationEnricher())

    // Start processor (resource:navigation + action:start_view → observation:view + signal:view_changed)
    startProcessor({ pipeline: context.pipeline, globalContext, userContext, accountContext })

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

export { viewsProcessor }
export type { ViewsPublicApi }
