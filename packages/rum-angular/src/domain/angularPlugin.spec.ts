import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '../../../core/test'
import { angularPlugin, onRumInit, onRumStart, resetAngularPlugin } from './angularPlugin'

const PUBLIC_API = {} as RumPublicApi
const INIT_CONFIGURATION = {} as RumInitConfiguration

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
        onRumStart: jasmine.any(Function),
      })
    )
  })

  it('calls callbacks registered with onRumInit during onInit', () => {
    const callbackSpy = jasmine.createSpy()
    const pluginConfiguration = {}
    onRumInit(callbackSpy)

    expect(callbackSpy).not.toHaveBeenCalled()

    angularPlugin(pluginConfiguration).onInit!({
      publicApi: PUBLIC_API,
      initConfiguration: INIT_CONFIGURATION,
    })

    expect(callbackSpy).toHaveBeenCalledTimes(1)
    expect(callbackSpy.calls.mostRecent().args[0]).toBe(pluginConfiguration)
    expect(callbackSpy.calls.mostRecent().args[1]).toBe(PUBLIC_API)
  })

  it('calls callbacks immediately if onInit was already invoked', () => {
    const callbackSpy = jasmine.createSpy()
    const pluginConfiguration = {}
    angularPlugin(pluginConfiguration).onInit!({
      publicApi: PUBLIC_API,
      initConfiguration: INIT_CONFIGURATION,
    })

    onRumInit(callbackSpy)

    expect(callbackSpy).toHaveBeenCalledTimes(1)
    expect(callbackSpy.calls.mostRecent().args[0]).toBe(pluginConfiguration)
    expect(callbackSpy.calls.mostRecent().args[1]).toBe(PUBLIC_API)
  })

  it('enforce manual view tracking when router is enabled', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    angularPlugin({ router: true }).onInit!({ publicApi: PUBLIC_API, initConfiguration })

    expect(initConfiguration.trackViewsManually).toBe(true)
  })

  it('does not enforce manual view tracking when router is disabled', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    angularPlugin({ router: false }).onInit!({ publicApi: PUBLIC_API, initConfiguration })

    expect(initConfiguration.trackViewsManually).toBeUndefined()
  })

  it('returns the configuration telemetry', () => {
    const pluginConfiguration = { router: true }
    const plugin = angularPlugin(pluginConfiguration)

    expect(plugin.getConfigurationTelemetry!()).toEqual({ router: true })
  })

  it('calls onRumStart subscribers during onRumStart', () => {
    const callbackSpy = jasmine.createSpy()
    const addErrorSpy = jasmine.createSpy()
    onRumStart(callbackSpy)

    angularPlugin().onRumStart!({ addError: addErrorSpy })

    expect(callbackSpy).toHaveBeenCalledWith(addErrorSpy)
  })

  it('calls onRumStart subscribers immediately if already started', () => {
    const addErrorSpy = jasmine.createSpy()
    angularPlugin().onRumStart!({ addError: addErrorSpy })

    const callbackSpy = jasmine.createSpy()
    onRumStart(callbackSpy)

    expect(callbackSpy).toHaveBeenCalledWith(addErrorSpy)
  })
})
