import { describe, it, expect, vi } from 'vitest'
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
    expect(reportErrorSpy).toHaveBeenCalledExactlyOnceWith(error, null, 'mounted hook')
    expect(originalErrorHandlerSpy).toHaveBeenCalledTimes(1)
    expect(originalErrorHandlerSpy).toHaveBeenCalledExactlyOnceWith(error, null, 'mounted hook')
    expect(hookSpy).toHaveBeenCalledExactlyOnceWith('app:error', expect.any(Function))
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
