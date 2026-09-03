import { version as reactVersion } from 'react'
import { toMajorVersionIntegration } from '@datadog/browser-core'
import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { createFakeInternalApi } from '../../../browser-rum-core/test'
import { onRumInit, reactPlugin, resetReactPlugin, setReactRouterType } from './reactPlugin'

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
      })
    )
  })

  it('calls callbacks registered with onReactPluginInit during onInit', () => {
    const callbackSpy = jasmine.createSpy()
    const pluginConfiguration = {}
    onRumInit(callbackSpy)

    expect(callbackSpy).not.toHaveBeenCalled()

    const { internalApi } = createFakeInternalApi()
    reactPlugin(pluginConfiguration).onInit({
      publicApi: PUBLIC_API,
      initConfiguration: INIT_CONFIGURATION,
      internalApi,
    })

    expect(callbackSpy).toHaveBeenCalledTimes(1)
    expect(callbackSpy.calls.mostRecent().args[0]).toBe(pluginConfiguration)
    expect(callbackSpy.calls.mostRecent().args[1]).toBe(PUBLIC_API)
    expect(callbackSpy.calls.mostRecent().args[2]).toBe(internalApi)
  })

  it('calls callbacks immediately if onInit was already invoked', () => {
    const callbackSpy = jasmine.createSpy()
    const pluginConfiguration = {}
    const { internalApi } = createFakeInternalApi()
    reactPlugin(pluginConfiguration).onInit({
      publicApi: PUBLIC_API,
      initConfiguration: INIT_CONFIGURATION,
      internalApi,
    })

    onRumInit(callbackSpy)

    expect(callbackSpy).toHaveBeenCalledTimes(1)
    expect(callbackSpy.calls.mostRecent().args[0]).toBe(pluginConfiguration)
    expect(callbackSpy.calls.mostRecent().args[1]).toBe(PUBLIC_API)
    expect(callbackSpy.calls.mostRecent().args[2]).toBe(internalApi)
  })

  it('enforce manual view tracking when router is enabled', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    reactPlugin({ router: true }).onInit({
      publicApi: PUBLIC_API,
      initConfiguration,
      internalApi: createFakeInternalApi().internalApi,
    })

    expect(initConfiguration.trackViewsManually).toBe(true)
  })

  it('does not enforce manual view tracking when router is disabled', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    reactPlugin({ router: false }).onInit({
      publicApi: PUBLIC_API,
      initConfiguration,
      internalApi: createFakeInternalApi().internalApi,
    })

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

  it('dispatches the internal API to onRumInit subscribers during onInit', () => {
    const callbackSpy = jasmine.createSpy()
    const { internalApi } = createFakeInternalApi()
    onRumInit(callbackSpy)

    reactPlugin().onInit({ publicApi: PUBLIC_API, initConfiguration: INIT_CONFIGURATION, internalApi })

    expect(callbackSpy).toHaveBeenCalledTimes(1)
    expect(callbackSpy.calls.mostRecent().args[2]).toBe(internalApi)
  })
})
