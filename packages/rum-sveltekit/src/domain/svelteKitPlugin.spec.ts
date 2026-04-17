import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '../../../core/test'
import { onRumInit, svelteKitPlugin, resetSvelteKitPlugin } from './svelteKitPlugin'

const PUBLIC_API = {} as RumPublicApi
const INIT_CONFIGURATION = {} as RumInitConfiguration

describe('svelteKitPlugin', () => {
  beforeEach(() => {
    registerCleanupTask(() => resetSvelteKitPlugin())
  })

  it('returns a plugin object with name "sveltekit"', () => {
    expect(svelteKitPlugin()).toEqual(jasmine.objectContaining({ name: 'sveltekit' }))
  })

  it('calls callbacks registered with onRumInit during onInit', () => {
    const spy = jasmine.createSpy()
    const config = {}
    onRumInit(spy)
    svelteKitPlugin(config).onInit({ publicApi: PUBLIC_API, initConfiguration: INIT_CONFIGURATION })
    expect(spy).toHaveBeenCalledOnceWith(config, PUBLIC_API)
  })

  it('calls callbacks immediately if onInit was already invoked', () => {
    const spy = jasmine.createSpy()
    const config = {}
    svelteKitPlugin(config).onInit({ publicApi: PUBLIC_API, initConfiguration: INIT_CONFIGURATION })
    onRumInit(spy)
    expect(spy).toHaveBeenCalledOnceWith(config, PUBLIC_API)
  })

  it('sets trackViewsManually when router is true', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    svelteKitPlugin({ router: true }).onInit({ publicApi: PUBLIC_API, initConfiguration })
    expect(initConfiguration.trackViewsManually).toBe(true)
  })

  it('does not set trackViewsManually when router is false', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    svelteKitPlugin({ router: false }).onInit({ publicApi: PUBLIC_API, initConfiguration })
    expect(initConfiguration.trackViewsManually).toBeUndefined()
  })

  it('returns configuration telemetry', () => {
    expect(svelteKitPlugin({ router: true }).getConfigurationTelemetry()).toEqual({ router: true })
  })
})
