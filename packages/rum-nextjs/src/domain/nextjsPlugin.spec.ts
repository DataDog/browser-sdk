import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '../../../core/test'
import { nextjsPlugin, onRumInit, onRumStart, resetNextjsPlugin } from './nextjsPlugin'

const PUBLIC_API = {} as RumPublicApi
const INIT_CONFIGURATION = {} as RumInitConfiguration

const routerTypes = ['app', 'pages'] as const

routerTypes.forEach((routerType) => {
  describe(`nextjsPlugin (router: '${routerType}')`, () => {
    beforeEach(() => {
      registerCleanupTask(() => {
        resetNextjsPlugin()
      })
    })

    it('returns a plugin object', () => {
      const plugin = nextjsPlugin({ router: routerType })

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

      nextjsPlugin({ router: routerType }).onInit({ publicApi: PUBLIC_API, initConfiguration })

      expect(initConfiguration.trackViewsManually).toBe(true)
    })

    it('calls onRumInit subscribers during onInit', () => {
      const callbackSpy = jasmine.createSpy()
      const pluginConfiguration = { router: routerType }
      onRumInit(callbackSpy)

      expect(callbackSpy).not.toHaveBeenCalled()

      nextjsPlugin(pluginConfiguration).onInit({
        publicApi: PUBLIC_API,
        initConfiguration: INIT_CONFIGURATION,
      })

      expect(callbackSpy).toHaveBeenCalledTimes(1)
      expect(callbackSpy.calls.mostRecent().args[0]).toBe(pluginConfiguration)
      expect(callbackSpy.calls.mostRecent().args[1]).toBe(PUBLIC_API)
    })

    it('calls onRumInit subscriber immediately if already initialized', () => {
      const callbackSpy = jasmine.createSpy()
      const pluginConfiguration = { router: routerType }

      nextjsPlugin(pluginConfiguration).onInit({
        publicApi: PUBLIC_API,
        initConfiguration: INIT_CONFIGURATION,
      })

      onRumInit(callbackSpy)

      expect(callbackSpy).toHaveBeenCalledTimes(1)
      expect(callbackSpy.calls.mostRecent().args[0]).toBe(pluginConfiguration)
      expect(callbackSpy.calls.mostRecent().args[1]).toBe(PUBLIC_API)
    })

    it('calls onRumStart subscribers during onRumStart', () => {
      const callbackSpy = jasmine.createSpy()
      const mockAddEvent = jasmine.createSpy()
      onRumStart(callbackSpy)

      const plugin = nextjsPlugin({ router: routerType })
      plugin.onInit({ publicApi: PUBLIC_API, initConfiguration: INIT_CONFIGURATION })
      plugin.onRumStart({ addEvent: mockAddEvent })

      expect(callbackSpy).toHaveBeenCalledWith(mockAddEvent)
    })

    it('calls onRumStart subscriber immediately if already started', () => {
      const mockAddEvent = jasmine.createSpy()
      const plugin = nextjsPlugin({ router: routerType })
      plugin.onInit({ publicApi: PUBLIC_API, initConfiguration: INIT_CONFIGURATION })
      plugin.onRumStart({ addEvent: mockAddEvent })

      const callbackSpy = jasmine.createSpy()
      onRumStart(callbackSpy)

      expect(callbackSpy).toHaveBeenCalledWith(mockAddEvent)
    })
  })
})
