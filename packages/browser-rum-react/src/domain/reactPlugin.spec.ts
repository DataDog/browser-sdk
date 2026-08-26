import { version as reactVersion } from 'react'
import { toMajorVersionIntegration } from '@datadog/browser-core'
import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { onRumInit, onRumStart, reactPlugin, resetReactPlugin, setReactRouterType } from './reactPlugin'

const PUBLIC_API = {} as RumPublicApi
const INIT_CONFIGURATION = {} as RumInitConfiguration

describe('reactPlugin', () => {
  afterEach(() => {
    resetReactPlugin()
  })

  it('returns a plugin object', () => {
    const plugin = reactPlugin()
    expect(plugin).toEqual(
      jasmine.objectContaining({
        name: 'react',
        onInit: jasmine.any(Function),
        onRumStart: jasmine.any(Function),
      })
    )
  })

  it('calls callbacks registered with onReactPluginInit during onInit', () => {
    const callbackSpy = jasmine.createSpy()
    const pluginConfiguration = {}
    onRumInit(callbackSpy)

    expect(callbackSpy).not.toHaveBeenCalled()

    void reactPlugin(pluginConfiguration).onInit({
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
    void reactPlugin(pluginConfiguration).onInit({
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
    void reactPlugin({ router: true }).onInit({ publicApi: PUBLIC_API, initConfiguration })

    expect(initConfiguration.trackViewsManually).toBe(true)
  })

  it('does not enforce manual view tracking when router is disabled', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    void reactPlugin({ router: false }).onInit({ publicApi: PUBLIC_API, initConfiguration })

    expect(initConfiguration.trackViewsManually).toBeUndefined()
  })

  it('returns the configuration telemetry', () => {
    const pluginConfiguration = { router: true }
    const plugin = reactPlugin(pluginConfiguration)

    setReactRouterType('react-router-v7')

    expect(plugin.getConfigurationTelemetry()).toEqual({
      router: true,
      integrations: [toMajorVersionIntegration('react', reactVersion), 'react-router-v7'],
    })
  })

  it('does not return integrations when router tracking is disabled', () => {
    setReactRouterType('react-router-v7')

    expect(reactPlugin().getConfigurationTelemetry()).toEqual({
      router: false,
      integrations: [toMajorVersionIntegration('react', reactVersion)],
    })
  })

  it('calls onRumStart subscribers during onRumStart', () => {
    const callbackSpy = jasmine.createSpy()
    const addErrorSpy = jasmine.createSpy()
    onRumStart(callbackSpy)

    reactPlugin().onRumStart({ addError: addErrorSpy })

    expect(callbackSpy).toHaveBeenCalledWith(addErrorSpy)
  })

  it('calls onRumStart subscribers immediately if already started', () => {
    const addErrorSpy = jasmine.createSpy()
    reactPlugin().onRumStart({ addError: addErrorSpy })

    const callbackSpy = jasmine.createSpy()
    onRumStart(callbackSpy)

    expect(callbackSpy).toHaveBeenCalledWith(addErrorSpy)
  })
})
