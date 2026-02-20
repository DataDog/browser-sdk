import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '../../../core/test'
import { initializeNextjsPlugin } from '../../test/initializeNextjsPlugin'
import { nextjsPlugin, resetNextjsPlugin } from './nextjsPlugin'
import { startNextjsView } from './startNextjsView'

describe('startNextjsView', () => {
  it('calls publicApi.startView with the view name', () => {
    const startViewSpy = jasmine.createSpy()
    initializeNextjsPlugin({
      publicApi: { startView: startViewSpy },
    })

    startNextjsView('/users/[id]')

    expect(startViewSpy).toHaveBeenCalledOnceWith('/users/[id]')
  })

  it('queues the view if plugin is not yet initialized', () => {
    const startViewSpy = jasmine.createSpy()

    startNextjsView('/users/[id]')

    const plugin = nextjsPlugin({ router: 'app' })
    plugin.onInit({
      publicApi: { startView: startViewSpy } as Partial<RumPublicApi> as RumPublicApi,
      initConfiguration: {} as RumInitConfiguration,
    })

    registerCleanupTask(() => resetNextjsPlugin())

    expect(startViewSpy).toHaveBeenCalledOnceWith('/users/[id]')
  })
})
