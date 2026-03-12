import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '../../../core/test'
import { angularPlugin, startAngularView, onRumInit, resetAngularPlugin } from './angularPlugin'

const INIT_CONFIGURATION = {} as RumInitConfiguration

function createPublicApi() {
  const startViewSpy = jasmine.createSpy('startView')
  return { publicApi: { startView: startViewSpy } as unknown as RumPublicApi, startViewSpy }
}

function initPlugin(options?: { router?: boolean }) {
  const { publicApi, startViewSpy } = createPublicApi()
  const plugin = angularPlugin(options)
  plugin.onInit!({ publicApi, initConfiguration: { ...INIT_CONFIGURATION } })
  return { plugin, publicApi, startViewSpy }
}

describe('angularPlugin', () => {
  beforeEach(() => {
    registerCleanupTask(() => {
      resetAngularPlugin()
    })
  })

  it('returns a plugin object', () => {
    const plugin = angularPlugin()

    expect(plugin).toEqual(
      jasmine.objectContaining({
        name: 'angular',
        onInit: jasmine.any(Function),
        getConfigurationTelemetry: jasmine.any(Function),
      })
    )
  })

  it('sets trackViewsManually to true when router is enabled', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    const { publicApi } = createPublicApi()

    angularPlugin({ router: true }).onInit!({ publicApi, initConfiguration })

    expect(initConfiguration.trackViewsManually).toBe(true)
  })

  it('does not set trackViewsManually when router is not enabled', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    const { publicApi } = createPublicApi()

    angularPlugin().onInit!({ publicApi, initConfiguration })

    expect(initConfiguration.trackViewsManually).toBeUndefined()
  })

  it('does not start a view on init', () => {
    const { startViewSpy } = initPlugin({ router: true })

    expect(startViewSpy).not.toHaveBeenCalled()
  })

  it('delegates startAngularView to publicApi.startView with name', () => {
    const { startViewSpy } = initPlugin({ router: true })

    startAngularView('/about')

    expect(startViewSpy).toHaveBeenCalledOnceWith({ name: '/about' })
  })

  it('does nothing if plugin not initialized when startAngularView is called', () => {
    // Don't call initPlugin(), so globalPublicApi is undefined
    expect(() => startAngularView('/about')).not.toThrow()
  })

  it('getConfigurationTelemetry returns { router: true } when router is enabled', () => {
    const plugin = angularPlugin({ router: true })

    expect(plugin.getConfigurationTelemetry!()).toEqual({ router: true })
  })

  it('getConfigurationTelemetry returns { router: false } when router is not enabled', () => {
    const plugin = angularPlugin()

    expect(plugin.getConfigurationTelemetry!()).toEqual({ router: false })
  })

  describe('lifecycle subscribers', () => {
    it('calls onRumInit subscribers during onInit', () => {
      const callbackSpy = jasmine.createSpy()
      const { publicApi } = createPublicApi()
      onRumInit(callbackSpy)

      expect(callbackSpy).not.toHaveBeenCalled()

      angularPlugin().onInit!({
        publicApi,
        initConfiguration: INIT_CONFIGURATION,
      })

      expect(callbackSpy).toHaveBeenCalledTimes(1)
      expect(callbackSpy.calls.mostRecent().args[0]).toBe(publicApi)
    })

    it('calls onRumInit subscriber immediately if already initialized', () => {
      const callbackSpy = jasmine.createSpy()
      const { publicApi } = createPublicApi()

      angularPlugin().onInit!({
        publicApi,
        initConfiguration: INIT_CONFIGURATION,
      })

      onRumInit(callbackSpy)

      expect(callbackSpy).toHaveBeenCalledTimes(1)
      expect(callbackSpy.calls.mostRecent().args[0]).toBe(publicApi)
    })
  })
})
