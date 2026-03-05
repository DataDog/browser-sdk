import { display } from '@datadog/browser-core'
import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '../../../../core/test'
import { reactPlugin, resetReactPlugin } from '../reactPlugin'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { startNextjsView } from './startNextjsView'

describe('startNextjsView', () => {
  it('starts a view with the given view name', () => {
    const startViewSpy = jasmine.createSpy()
    initializeReactPlugin({
      configuration: {
        nextAppRouter: true,
      },
      publicApi: {
        startView: startViewSpy,
      },
    })

    startNextjsView('/users/:id')

    expect(startViewSpy).toHaveBeenCalledOnceWith('/users/:id')
  })

  it('displays a warning if nextAppRouter is not enabled', () => {
    const displayWarnSpy = spyOn(display, 'warn')
    initializeReactPlugin({
      configuration: {},
    })

    startNextjsView('/users/:id')

    expect(displayWarnSpy).toHaveBeenCalledOnceWith(
      '`nextAppRouter: true` is missing from the react plugin configuration, the view will not be tracked.'
    )
  })

  it('does not start a view when nextAppRouter is not enabled', () => {
    const startViewSpy = jasmine.createSpy()
    initializeReactPlugin({
      configuration: {},
      publicApi: {
        startView: startViewSpy,
      },
    })

    startNextjsView('/users/:id')

    expect(startViewSpy).not.toHaveBeenCalled()
  })

  it('defers view start until RUM is initialized', () => {
    const startViewSpy = jasmine.createSpy()
    // Reset plugin state so no global init has happened yet
    resetReactPlugin()
    registerCleanupTask(() => resetReactPlugin())

    // Call before init — callback is queued
    startNextjsView('/users/:id')
    expect(startViewSpy).not.toHaveBeenCalled()

    // Initialize the plugin — queued callbacks fire
    reactPlugin({ nextAppRouter: true }).onInit({
      publicApi: { startView: startViewSpy } as unknown as RumPublicApi,
      initConfiguration: {} as RumInitConfiguration,
    })

    expect(startViewSpy).toHaveBeenCalledOnceWith('/users/:id')
  })
})
