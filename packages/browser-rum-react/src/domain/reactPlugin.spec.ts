import { vi, afterEach, describe, expect, it } from 'vitest'
import { version as reactVersion } from 'react'
import { toMajorVersionIntegration } from '@datadog/browser-core'
import type { RumInitConfiguration, RumPluginOnInitOptions, RumPublicApi } from '@datadog/browser-rum-core'
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
      expect.objectContaining({
        name: 'react',
        onInit: expect.any(Function),
        onRumStart: expect.any(Function),
      })
    )
  })

  it('calls callbacks registered with onReactPluginInit during onInit', () => {
    const callbackSpy = vi.fn()
    const pluginConfiguration = {}
    onRumInit(callbackSpy)

    expect(callbackSpy).not.toHaveBeenCalled()

    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- onInit never returns a promise for this plugin
    reactPlugin(pluginConfiguration).onInit({
      publicApi: PUBLIC_API,
      initConfiguration: INIT_CONFIGURATION,
    } as RumPluginOnInitOptions)

    expect(callbackSpy).toHaveBeenCalledTimes(1)
    expect(callbackSpy.mock.lastCall![0]).toBe(pluginConfiguration)
    expect(callbackSpy.mock.lastCall![1]).toBe(PUBLIC_API)
  })

  it('calls callbacks immediately if onInit was already invoked', () => {
    const callbackSpy = vi.fn()
    const pluginConfiguration = {}
    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- onInit never returns a promise for this plugin
    reactPlugin(pluginConfiguration).onInit({
      publicApi: PUBLIC_API,
      initConfiguration: INIT_CONFIGURATION,
    } as RumPluginOnInitOptions)

    onRumInit(callbackSpy)

    expect(callbackSpy).toHaveBeenCalledTimes(1)
    expect(callbackSpy.mock.lastCall![0]).toBe(pluginConfiguration)
    expect(callbackSpy.mock.lastCall![1]).toBe(PUBLIC_API)
  })

  it('enforce manual view tracking when router is enabled', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- onInit never returns a promise for this plugin
    reactPlugin({ router: true }).onInit({ publicApi: PUBLIC_API, initConfiguration } as RumPluginOnInitOptions)

    expect(initConfiguration.trackViewsManually).toBe(true)
  })

  it('does not enforce manual view tracking when router is disabled', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- onInit never returns a promise for this plugin
    reactPlugin({ router: false }).onInit({ publicApi: PUBLIC_API, initConfiguration } as RumPluginOnInitOptions)

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
    const callbackSpy = vi.fn()
    const addErrorSpy = vi.fn()
    onRumStart(callbackSpy)

    reactPlugin().onRumStart({ addError: addErrorSpy })

    expect(callbackSpy).toHaveBeenCalledWith(addErrorSpy)
  })

  it('calls onRumStart subscribers immediately if already started', () => {
    const addErrorSpy = vi.fn()
    reactPlugin().onRumStart({ addError: addErrorSpy })

    const callbackSpy = vi.fn()
    onRumStart(callbackSpy)

    expect(callbackSpy).toHaveBeenCalledWith(addErrorSpy)
  })
})
