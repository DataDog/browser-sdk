import { describe, it, expect, vi, type Mock } from 'vitest'
import type { App } from 'vue'
import type { NuxtApp } from './setupNuxtErrorHandling'
import { setupNuxtErrorHandling } from './setupNuxtErrorHandling'

describe('setupNuxtErrorHandling', () => {
  it('reports Vue errors and preserves the original error handler', () => {
    const reportErrorSpy = vi.fn()
    const originalErrorHandlerSpy = vi.fn()
    const hookSpy = vi.fn()
    const nuxtApp = {
      vueApp: {
        config: {
          errorHandler: originalErrorHandlerSpy,
        },
      },
      hook: hookSpy,
    } as unknown as NuxtApp

    setupNuxtErrorHandling(nuxtApp, reportErrorSpy)

    const error = new Error('oops')
    const errorHandler = nuxtApp.vueApp.config.errorHandler as NonNullable<App['config']['errorHandler']>
    errorHandler(error, null, 'mounted hook')

    expect(reportErrorSpy).toHaveBeenCalledTimes(1)
    expect(reportErrorSpy).toHaveBeenCalledWith(error, null, 'mounted hook')
    expect(originalErrorHandlerSpy).toHaveBeenCalledTimes(1)
    expect(originalErrorHandlerSpy).toHaveBeenCalledWith(error, null, 'mounted hook')
    expect(hookSpy).toHaveBeenCalledWith('app:error', expect.any(Function))
  })

  it("stops calling Nuxt's default error handler after hydration", () => {
    const reportErrorSpy = vi.fn()
    const nuxtDefaultErrorHandlerSpy = vi.fn() as Mock & { __nuxt_default?: true }
    nuxtDefaultErrorHandlerSpy.__nuxt_default = true
    let suspenseResolveCallback!: () => void
    const nuxtApp = {
      vueApp: {
        config: {
          errorHandler: nuxtDefaultErrorHandlerSpy,
        },
      },
      hook: vi.fn().mockImplementation((name: string, callback: () => void) => {
        if (name === 'app:suspense:resolve') {
          suspenseResolveCallback = callback
        }
      }),
    } as unknown as NuxtApp

    setupNuxtErrorHandling(nuxtApp, reportErrorSpy)

    const initialError = new Error('initial')
    const errorHandler = nuxtApp.vueApp.config.errorHandler as NonNullable<App['config']['errorHandler']>
    errorHandler(initialError, null, 'mounted hook')

    suspenseResolveCallback()

    const postHydrationError = new Error('post hydration')
    errorHandler(postHydrationError, null, 'native event handler')

    expect(reportErrorSpy.mock.calls).toEqual([
      [initialError, null, 'mounted hook'],
      [postHydrationError, null, 'native event handler'],
    ])
    expect(nuxtDefaultErrorHandlerSpy).toHaveBeenCalledExactlyOnceWith(initialError, null, 'mounted hook')
  })

  it('keeps calling a custom error handler after hydration', () => {
    const reportErrorSpy = vi.fn()
    const customErrorHandlerSpy = vi.fn()
    let suspenseResolveCallback!: () => void
    const nuxtApp = {
      vueApp: {
        config: {
          errorHandler: customErrorHandlerSpy,
        },
      },
      hook: vi.fn().mockImplementation((name: string, callback: () => void) => {
        if (name === 'app:suspense:resolve') {
          suspenseResolveCallback = callback
        }
      }),
    } as unknown as NuxtApp

    setupNuxtErrorHandling(nuxtApp, reportErrorSpy)

    suspenseResolveCallback()

    const error = new Error('oops')
    const errorHandler = nuxtApp.vueApp.config.errorHandler as NonNullable<App['config']['errorHandler']>
    errorHandler(error, null, 'mounted hook')

    expect(reportErrorSpy).toHaveBeenCalledExactlyOnceWith(error, null, 'mounted hook')
    expect(customErrorHandlerSpy).toHaveBeenCalledExactlyOnceWith(error, null, 'mounted hook')
  })

  it('deduplicates the same error between Vue and app:error hooks', () => {
    const reportErrorSpy = vi.fn()
    let appErrorCallback!: (err: unknown) => void
    const nuxtApp = {
      vueApp: {
        config: {},
      },
      hook: vi.fn().mockImplementation((_name: string, callback: (err: unknown) => void) => {
        appErrorCallback = callback
      }),
    } as unknown as NuxtApp

    setupNuxtErrorHandling(nuxtApp, reportErrorSpy)

    const error = new Error('oops')
    const errorHandler = nuxtApp.vueApp.config.errorHandler as NonNullable<App['config']['errorHandler']>
    errorHandler(error, null, '')
    appErrorCallback(error)

    expect(reportErrorSpy).toHaveBeenCalledTimes(1)
  })
})
