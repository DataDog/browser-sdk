import type { ComponentInternalInstance, ComponentPublicInstance } from 'vue'
import { noop } from '@datadog/browser-core'
import { mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { initializeNuxtPlugin } from '../../../test/initializeNuxtPlugin'
import { nuxtRumPlugin, resetNuxtPlugin } from '../nuxtPlugin'
import { addNuxtError } from './addNuxtError'

describe('addNuxtError', () => {
  it('does nothing when the plugin is not initialized', () => {
    registerCleanupTask(() => {
      resetNuxtPlugin()
    })

    expect(() => addNuxtError(new Error('test'), null, 'mounted hook')).not.toThrow()
  })

  it('delegates the error to addError with the nuxt vue error source', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeNuxtPlugin({ addError: addErrorSpy })
    const error = new Error('something broke')

    addNuxtError(error, null, 'mounted hook')

    expect(addErrorSpy).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        error,
        handlingStack: jasmine.any(String),
        componentStack: 'mounted hook',
        startClocks: jasmine.any(Object),
        context: {
          framework: 'nuxt',
          nuxt: { source: 'vueApp.config.errorHandler' },
        },
      })
    )
  })

  it('includes component hierarchy in component_stack when instance is provided', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeNuxtPlugin({ addError: addErrorSpy })

    const parentInternal = { type: { name: 'ParentComponent' }, parent: null } as unknown as ComponentInternalInstance
    const childInternal = {
      type: { name: 'ChildComponent' },
      parent: parentInternal,
    } as unknown as ComponentInternalInstance
    const mockInstance = { $: childInternal } as unknown as ComponentPublicInstance

    addNuxtError(new Error('oops'), mockInstance, 'mounted hook')

    const componentStack = addErrorSpy.calls.mostRecent().args[0].componentStack as string
    expect(componentStack).toContain('mounted hook')
    expect(componentStack).toContain('at <ChildComponent>')
    expect(componentStack).toContain('at <ParentComponent>')
  })

  it('handles empty info gracefully', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeNuxtPlugin({ addError: addErrorSpy })

    addNuxtError(new Error('oops'), null, '')

    expect(addErrorSpy).toHaveBeenCalledTimes(1)
    expect(addErrorSpy.calls.mostRecent().args[0].componentStack).toBeUndefined()
  })

  it('does not let error.dd_context overwrite nuxt context fields', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeNuxtPlugin({ addError: addErrorSpy })
    const error = Object.assign(new Error('error message'), {
      dd_context: {
        framework: 'from-dd-context',
        nuxt: { source: 'from-dd-context' },
        component: 'Menu',
      },
    })

    addNuxtError(error, null, 'mounted hook')

    expect(addErrorSpy.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({
        context: {
          framework: 'nuxt',
          nuxt: { source: 'vueApp.config.errorHandler' },
          component: 'Menu',
        },
      })
    )
  })

  it('computes startClocks when replaying vue errors after RUM start', () => {
    const clock = mockClock()
    const addErrorSpy = jasmine.createSpy()
    const plugin = nuxtRumPlugin({
      router: jasmine.createSpyObj('router', ['afterEach'], { currentRoute: { value: { matched: [] } } }),
    })

    plugin.onInit({
      publicApi: { startView: noop } as RumPublicApi,
      initConfiguration: {} as RumInitConfiguration,
    })

    addNuxtError(new Error('startup failed'), null, 'mounted hook')
    clock.tick(100)

    plugin.onRumStart({ addError: addErrorSpy })

    expect(addErrorSpy.calls.mostRecent().args[0].startClocks).toEqual({
      relative: clock.relative(100),
      timeStamp: clock.timeStamp(100),
    })
  })
})
