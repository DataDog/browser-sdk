import { noop } from '@datadog/browser-core'
import { mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { initializeNuxtPlugin } from '../../../test/initializeNuxtPlugin'
import { nuxtRumPlugin, resetNuxtPlugin } from '../nuxtPlugin'
import { addNuxtAppError } from './addNuxtAppError'

describe('addNuxtAppError', () => {
  it('does nothing when the plugin is not initialized', () => {
    registerCleanupTask(() => {
      resetNuxtPlugin()
    })

    expect(() => addNuxtAppError(new Error('test'))).not.toThrow()
  })

  it('delegates the error to addError with the nuxt app:error source', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeNuxtPlugin({ addError: addErrorSpy })
    const error = new Error('startup failed')

    addNuxtAppError(error)

    expect(addErrorSpy).toHaveBeenCalledOnceWith({
      error,
      handlingStack: jasmine.any(String),
      componentStack: undefined,
      startClocks: jasmine.any(Object),
      context: {
        framework: 'nuxt',
        nuxt: { source: 'app:error' },
      },
    })
  })

  it('does not let error.dd_context overwrite nuxt context fields', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeNuxtPlugin({ addError: addErrorSpy })
    const error = Object.assign(new Error('startup failed'), {
      dd_context: {
        framework: 'from-dd-context',
        nuxt: { source: 'from-dd-context' },
        plugin: 'failing-plugin',
      },
    })

    addNuxtAppError(error)

    expect(addErrorSpy.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({
        context: {
          framework: 'nuxt',
          nuxt: { source: 'app:error' },
          plugin: 'failing-plugin',
        },
      })
    )
  })

  it('computes startClocks when replaying errors after RUM start', () => {
    const clock = mockClock()
    const addErrorSpy = jasmine.createSpy()
    const plugin = nuxtRumPlugin({
      router: jasmine.createSpyObj('router', ['afterEach'], { currentRoute: { value: { matched: [] } } }),
    })

    plugin.onInit({
      publicApi: { startView: noop } as RumPublicApi,
      initConfiguration: {} as RumInitConfiguration,
    })

    addNuxtAppError(new Error('startup failed'))
    clock.tick(100)

    plugin.onRumStart({ addError: addErrorSpy })

    expect(addErrorSpy.calls.mostRecent().args[0].startClocks).toEqual({
      relative: clock.relative(100),
      timeStamp: clock.timeStamp(100),
    })
  })
})
