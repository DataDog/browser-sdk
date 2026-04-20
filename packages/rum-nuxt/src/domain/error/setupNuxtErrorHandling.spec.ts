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
