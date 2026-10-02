import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VERSION } from '@angular/core'
import { toMajorVersionIntegration } from '@datadog/browser-core'
import type { RumInitConfiguration, RumPluginOnInitOptions, RumPublicApi } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '../../../browser-core/test'
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
      expect.objectContaining({
        name: 'angular',
        onInit: expect.any(Function),
        onRumStart: expect.any(Function),
      })
    )
  })

  it('calls callbacks registered with onRumInit during onInit', () => {
    const callbackSpy = vi.fn()
    const pluginConfiguration = {}
    onRumInit(callbackSpy)

    expect(callbackSpy).not.toHaveBeenCalled()

    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- onInit never returns a promise for this plugin
    angularPlugin(pluginConfiguration).onInit!({
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
    angularPlugin(pluginConfiguration).onInit!({
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
    angularPlugin({ router: true }).onInit!({ publicApi: PUBLIC_API, initConfiguration } as RumPluginOnInitOptions)

    expect(initConfiguration.trackViewsManually).toBe(true)
  })

  it('does not enforce manual view tracking when router is disabled', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- onInit never returns a promise for this plugin
    angularPlugin({ router: false }).onInit!({ publicApi: PUBLIC_API, initConfiguration } as RumPluginOnInitOptions)

    expect(initConfiguration.trackViewsManually).toBeUndefined()
  })

  it('returns the configuration telemetry', () => {
    const pluginConfiguration = { router: true }
    const plugin = angularPlugin(pluginConfiguration)

    expect(plugin.getConfigurationTelemetry!()).toEqual({
      router: true,
      integrations: [toMajorVersionIntegration('angular', VERSION.major), 'angular-router'],
    })
  })

  it('returns the Angular integration when router tracking is disabled', () => {
    expect(angularPlugin().getConfigurationTelemetry!()).toEqual({
      router: false,
      integrations: [toMajorVersionIntegration('angular', VERSION.major)],
    })
  })

  it('calls onRumStart subscribers during onRumStart', () => {
    const callbackSpy = vi.fn()
    const addErrorSpy = vi.fn()
    onRumStart(callbackSpy)

    angularPlugin().onRumStart!({ addError: addErrorSpy })

    expect(callbackSpy).toHaveBeenCalledWith(addErrorSpy)
  })

  it('calls onRumStart subscribers immediately if already started', () => {
    const addErrorSpy = vi.fn()
    angularPlugin().onRumStart!({ addError: addErrorSpy })

    const callbackSpy = vi.fn()
    onRumStart(callbackSpy)

    expect(callbackSpy).toHaveBeenCalledWith(addErrorSpy)
  })
})
