import { VERSION } from '@angular/core'
import { toMajorVersionIntegration } from '@datadog/browser-core'
import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '../../../browser-core/test'
import { createFakeInternalApi } from '../../../browser-rum-core/test'
import { angularPlugin, onRumInit, resetAngularPlugin } from './angularPlugin'

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
      })
    )
  })

  it('calls callbacks registered with onRumInit during onInit', () => {
    const callbackSpy = jasmine.createSpy()
    const pluginConfiguration = {}
    onRumInit(callbackSpy)

    expect(callbackSpy).not.toHaveBeenCalled()

    const { internalApi } = createFakeInternalApi()
    angularPlugin(pluginConfiguration).onInit!({
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
    angularPlugin(pluginConfiguration).onInit!({
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
    angularPlugin({ router: true }).onInit!({
      publicApi: PUBLIC_API,
      initConfiguration,
      internalApi: createFakeInternalApi().internalApi,
    })

    expect(initConfiguration.trackViewsManually).toBe(true)
  })

  it('does not enforce manual view tracking when router is disabled', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    angularPlugin({ router: false }).onInit!({
      publicApi: PUBLIC_API,
      initConfiguration,
      internalApi: createFakeInternalApi().internalApi,
    })

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

  it('dispatches the internal API to onRumInit subscribers during onInit', () => {
    const callbackSpy = jasmine.createSpy()
    const { internalApi } = createFakeInternalApi()
    onRumInit(callbackSpy)

    angularPlugin().onInit!({ publicApi: PUBLIC_API, initConfiguration: INIT_CONFIGURATION, internalApi })

    expect(callbackSpy).toHaveBeenCalledTimes(1)
    expect(callbackSpy.calls.mostRecent().args[2]).toBe(internalApi)
  })
})
