import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '../../../core/test'
import { onRumInit, angularPlugin, resetAngularPlugin } from './angularPlugin'

const PUBLIC_API = {} as RumPublicApi
const INIT_CONFIGURATION = {} as RumInitConfiguration

describe('angularPlugin', () => {
  beforeEach(() => {
    registerCleanupTask(() => resetAngularPlugin())
  })

  it('returns a plugin object with name "angular"', () => {
    expect(angularPlugin()).toEqual(jasmine.objectContaining({ name: 'angular' }))
  })

  it('calls callbacks registered with onRumInit during onInit', () => {
    const spy = jasmine.createSpy()
    const config = {}
    onRumInit(spy)
    angularPlugin(config).onInit({ publicApi: PUBLIC_API, initConfiguration: INIT_CONFIGURATION })
    expect(spy).toHaveBeenCalledOnceWith(config, PUBLIC_API)
  })

  it('calls callbacks immediately if onInit was already invoked', () => {
    const spy = jasmine.createSpy()
    const config = {}
    angularPlugin(config).onInit({ publicApi: PUBLIC_API, initConfiguration: INIT_CONFIGURATION })
    onRumInit(spy)
    expect(spy).toHaveBeenCalledOnceWith(config, PUBLIC_API)
  })

  it('sets trackViewsManually when router is true', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    angularPlugin({ router: true }).onInit({ publicApi: PUBLIC_API, initConfiguration })
    expect(initConfiguration.trackViewsManually).toBe(true)
  })

  it('does not set trackViewsManually when router is false', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    angularPlugin({ router: false }).onInit({ publicApi: PUBLIC_API, initConfiguration })
    expect(initConfiguration.trackViewsManually).toBeUndefined()
  })

  it('returns configuration telemetry', () => {
    expect(angularPlugin({ router: true }).getConfigurationTelemetry()).toEqual({ router: true })
  })
})
