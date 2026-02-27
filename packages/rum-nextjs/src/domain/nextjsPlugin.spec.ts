import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '../../../core/test'
import { nextjsPlugin, startNextjsView, onRumInit, onRumStart, resetNextjsPlugin } from './nextjsPlugin'

const INIT_CONFIGURATION = {} as RumInitConfiguration

function createPublicApi() {
  const startViewSpy = jasmine.createSpy('startView')
  return { publicApi: { startView: startViewSpy } as unknown as RumPublicApi, startViewSpy }
}

function initPlugin() {
  const { publicApi, startViewSpy } = createPublicApi()
  const plugin = nextjsPlugin({ router: 'app' })
  plugin.onInit({ publicApi, initConfiguration: { ...INIT_CONFIGURATION } })
  return { plugin, publicApi, startViewSpy }
}

describe('nextjsPlugin', () => {
  beforeEach(() => {
    registerCleanupTask(() => {
      resetNextjsPlugin()
    })
  })

  it('returns a plugin object', () => {
    const plugin = nextjsPlugin({ router: 'app' })

    expect(plugin).toEqual(
      jasmine.objectContaining({
        name: 'nextjs',
        onInit: jasmine.any(Function),
        onRumStart: jasmine.any(Function),
      })
    )
  })

  it('sets trackViewsManually to true', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    const { publicApi } = createPublicApi()

    nextjsPlugin({ router: 'app' }).onInit({ publicApi, initConfiguration })

    expect(initConfiguration.trackViewsManually).toBe(true)
  })

  it('starts the initial view with the current pathname on init', () => {
    const { startViewSpy } = initPlugin()

    expect(startViewSpy).toHaveBeenCalledOnceWith(window.location.pathname)
  })

  it('delegates startNextjsView to publicApi.startView', () => {
    const { startViewSpy } = initPlugin()
    startViewSpy.calls.reset()

    startNextjsView('/about')

    expect(startViewSpy).toHaveBeenCalledOnceWith('/about')
  })

  describe('lifecycle subscribers', () => {
    it('calls onRumInit subscribers during onInit', () => {
      const callbackSpy = jasmine.createSpy()
      const pluginConfiguration = { router: 'app' as const }
      const { publicApi } = createPublicApi()
      onRumInit(callbackSpy)

      expect(callbackSpy).not.toHaveBeenCalled()

      nextjsPlugin(pluginConfiguration).onInit({
        publicApi,
        initConfiguration: INIT_CONFIGURATION,
      })

      expect(callbackSpy).toHaveBeenCalledTimes(1)
      expect(callbackSpy.calls.mostRecent().args[0]).toBe(pluginConfiguration)
      expect(callbackSpy.calls.mostRecent().args[1]).toBe(publicApi)
    })

    it('calls onRumInit subscriber immediately if already initialized', () => {
      const callbackSpy = jasmine.createSpy()
      const pluginConfiguration = { router: 'app' as const }
      const { publicApi } = createPublicApi()

      nextjsPlugin(pluginConfiguration).onInit({
        publicApi,
        initConfiguration: INIT_CONFIGURATION,
      })

      onRumInit(callbackSpy)

      expect(callbackSpy).toHaveBeenCalledTimes(1)
      expect(callbackSpy.calls.mostRecent().args[0]).toBe(pluginConfiguration)
      expect(callbackSpy.calls.mostRecent().args[1]).toBe(publicApi)
    })

    it('calls onRumStart subscribers during onRumStart', () => {
      const callbackSpy = jasmine.createSpy()
      const mockAddEvent = jasmine.createSpy()
      onRumStart(callbackSpy)

      const { plugin } = initPlugin()
      plugin.onRumStart({ addEvent: mockAddEvent })

      expect(callbackSpy).toHaveBeenCalledWith(mockAddEvent)
    })

    it('calls onRumStart subscriber immediately if already started', () => {
      const mockAddEvent = jasmine.createSpy()
      const { plugin } = initPlugin()
      plugin.onRumStart({ addEvent: mockAddEvent })

      const callbackSpy = jasmine.createSpy()
      onRumStart(callbackSpy)

      expect(callbackSpy).toHaveBeenCalledWith(mockAddEvent)
    })
  })
})
