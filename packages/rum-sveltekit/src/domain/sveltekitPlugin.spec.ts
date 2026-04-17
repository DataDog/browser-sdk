import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '../../../core/test'
import { onRumInit, sveltekitPlugin, resetSveltekitPlugin } from './sveltekitPlugin'

const PUBLIC_API = {} as RumPublicApi
const INIT_CONFIGURATION = {} as RumInitConfiguration

describe('sveltekitPlugin', () => {
  beforeEach(() => {
    registerCleanupTask(() => resetSveltekitPlugin())
  })

  it('returns a plugin object with name "sveltekit"', () => {
    expect(sveltekitPlugin()).toEqual(jasmine.objectContaining({ name: 'sveltekit' }))
  })

  it('calls callbacks registered with onRumInit during onInit', () => {
    const spy = jasmine.createSpy()
    const config = {}
    onRumInit(spy)
    sveltekitPlugin(config).onInit({ publicApi: PUBLIC_API, initConfiguration: INIT_CONFIGURATION })
    expect(spy).toHaveBeenCalledOnceWith(config, PUBLIC_API)
  })

  it('calls callbacks immediately if onInit was already invoked', () => {
    const spy = jasmine.createSpy()
    const config = {}
    sveltekitPlugin(config).onInit({ publicApi: PUBLIC_API, initConfiguration: INIT_CONFIGURATION })
    onRumInit(spy)
    expect(spy).toHaveBeenCalledOnceWith(config, PUBLIC_API)
  })

  it('sets trackViewsManually when router is true', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    sveltekitPlugin({ router: true }).onInit({ publicApi: PUBLIC_API, initConfiguration })
    expect(initConfiguration.trackViewsManually).toBe(true)
  })

  it('does not set trackViewsManually when router is false', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    sveltekitPlugin({ router: false }).onInit({ publicApi: PUBLIC_API, initConfiguration })
    expect(initConfiguration.trackViewsManually).toBeUndefined()
  })

  it('returns configuration telemetry', () => {
    expect(sveltekitPlugin({ router: true }).getConfigurationTelemetry()).toEqual({ router: true })
  })
})
