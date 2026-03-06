import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { onVueInit, vuePlugin, resetVuePlugin } from './vuePlugin'

const PUBLIC_API = {} as RumPublicApi
const INIT_CONFIGURATION = {} as RumInitConfiguration

describe('vuePlugin', () => {
  afterEach(() => {
    resetVuePlugin()
  })

  it('returns a plugin object with name "vue"', () => {
    expect(vuePlugin()).toEqual(jasmine.objectContaining({ name: 'vue' }))
  })

  it('calls callbacks registered with onVueInit during onInit', () => {
    const spy = jasmine.createSpy()
    const config = {}
    onVueInit(spy)
    vuePlugin(config).onInit({ publicApi: PUBLIC_API, initConfiguration: INIT_CONFIGURATION })
    expect(spy).toHaveBeenCalledOnceWith(config, PUBLIC_API)
  })

  it('calls callbacks immediately if onInit was already invoked', () => {
    const spy = jasmine.createSpy()
    const config = {}
    vuePlugin(config).onInit({ publicApi: PUBLIC_API, initConfiguration: INIT_CONFIGURATION })
    onVueInit(spy)
    expect(spy).toHaveBeenCalledOnceWith(config, PUBLIC_API)
  })

  it('sets trackViewsManually when router is true', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    vuePlugin({ router: true }).onInit({ publicApi: PUBLIC_API, initConfiguration })
    expect(initConfiguration.trackViewsManually).toBe(true)
  })

  it('does not set trackViewsManually when router is false', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    vuePlugin({ router: false }).onInit({ publicApi: PUBLIC_API, initConfiguration })
    expect(initConfiguration.trackViewsManually).toBeUndefined()
  })

  it('returns configuration telemetry', () => {
    expect(vuePlugin({ router: true }).getConfigurationTelemetry()).toEqual({ router: true })
  })
})
