import { version as vueVersion } from 'vue'
import { toMajorVersionIntegration } from '@datadog/browser-core'
import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '../../../browser-core/test'
import { createFakeInternalApi } from '../../../browser-rum-core/test'
import { onRumInit, vuePlugin, resetVuePlugin } from './vuePlugin'

const PUBLIC_API = {} as RumPublicApi
const INIT_CONFIGURATION = {} as RumInitConfiguration

describe('vuePlugin', () => {
  beforeEach(() => {
    registerCleanupTask(() => resetVuePlugin())
  })

  it('returns a plugin object with name "vue"', () => {
    expect(vuePlugin()).toEqual(jasmine.objectContaining({ name: 'vue' }))
  })

  it('calls callbacks registered with onRumInit during onInit', () => {
    const spy = jasmine.createSpy()
    const config = {}
    const { internalApi } = createFakeInternalApi()
    onRumInit(spy)
    vuePlugin(config).onInit({ publicApi: PUBLIC_API, initConfiguration: INIT_CONFIGURATION, internalApi })
    expect(spy).toHaveBeenCalledOnceWith(config, PUBLIC_API, internalApi)
  })

  it('calls callbacks immediately if onInit was already invoked', () => {
    const spy = jasmine.createSpy()
    const config = {}
    const { internalApi } = createFakeInternalApi()
    vuePlugin(config).onInit({ publicApi: PUBLIC_API, initConfiguration: INIT_CONFIGURATION, internalApi })
    onRumInit(spy)
    expect(spy).toHaveBeenCalledOnceWith(config, PUBLIC_API, internalApi)
  })

  it('sets trackViewsManually when router is true', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    vuePlugin({ router: true }).onInit({
      publicApi: PUBLIC_API,
      initConfiguration,
      internalApi: createFakeInternalApi().internalApi,
    })
    expect(initConfiguration.trackViewsManually).toBe(true)
  })

  it('does not set trackViewsManually when router is false', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    vuePlugin({ router: false }).onInit({
      publicApi: PUBLIC_API,
      initConfiguration,
      internalApi: createFakeInternalApi().internalApi,
    })
    expect(initConfiguration.trackViewsManually).toBeUndefined()
  })

  it('returns configuration telemetry', () => {
    expect(vuePlugin({ router: true }).getConfigurationTelemetry()).toEqual({
      router: true,
      integrations: [toMajorVersionIntegration('vue', vueVersion), 'vue-router'],
    })
  })

  it('returns the Vue integration when router tracking is disabled', () => {
    expect(vuePlugin().getConfigurationTelemetry()).toEqual({
      router: false,
      integrations: [toMajorVersionIntegration('vue', vueVersion)],
    })
  })
})
