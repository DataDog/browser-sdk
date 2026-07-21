import type { App } from 'vue'
import type { NuxtApp } from './setupNuxtErrorHandling'
import { setupNuxtErrorHandling } from './setupNuxtErrorHandling'

describe('setupNuxtErrorHandling', () => {
  it('reports Vue errors and preserves the original error handler', () => {
    const reportErrorSpy = jasmine.createSpy()
    const originalErrorHandlerSpy = jasmine.createSpy()
    const hookSpy = jasmine.createSpy()
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

    expect(reportErrorSpy).toHaveBeenCalledOnceWith(error, null, 'mounted hook')
    expect(originalErrorHandlerSpy).toHaveBeenCalledOnceWith(error, null, 'mounted hook')
    expect(hookSpy).toHaveBeenCalledWith('app:error', jasmine.any(Function))
  })

  it("stops calling Nuxt's default error handler after hydration", () => {
    const reportErrorSpy = jasmine.createSpy()
    const originalErrorHandlerSpy = jasmine.createSpy() as jasmine.Spy & { __nuxt_default?: true }
    originalErrorHandlerSpy.__nuxt_default = true
    let suspenseResolveCallback!: () => void
    const nuxtApp = {
      vueApp: {
        config: {
          errorHandler: originalErrorHandlerSpy,
        },
      },
      hook: jasmine.createSpy().and.callFake((name: string, callback: () => void) => {
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

    expect(reportErrorSpy.calls.allArgs()).toEqual([
      [initialError, null, 'mounted hook'],
      [postHydrationError, null, 'native event handler'],
    ])
    expect(originalErrorHandlerSpy).toHaveBeenCalledOnceWith(initialError, null, 'mounted hook')
  })

  it('keeps calling a custom original error handler after hydration', () => {
    const reportErrorSpy = jasmine.createSpy()
    const originalErrorHandlerSpy = jasmine.createSpy()
    let suspenseResolveCallback!: () => void
    const nuxtApp = {
      vueApp: {
        config: {
          errorHandler: originalErrorHandlerSpy,
        },
      },
      hook: jasmine.createSpy().and.callFake((name: string, callback: () => void) => {
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

    expect(reportErrorSpy).toHaveBeenCalledOnceWith(error, null, 'mounted hook')
    expect(originalErrorHandlerSpy).toHaveBeenCalledOnceWith(error, null, 'mounted hook')
  })

  it('deduplicates the same error between Vue and app:error hooks', () => {
    const reportErrorSpy = jasmine.createSpy()
    let appErrorCallback!: (err: unknown) => void
    const nuxtApp = {
      vueApp: {
        config: {},
      },
      hook: jasmine.createSpy().and.callFake((_name: string, callback: (err: unknown) => void) => {
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
