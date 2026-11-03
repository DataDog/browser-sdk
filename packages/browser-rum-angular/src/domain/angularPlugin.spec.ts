import { VERSION } from '@angular/core'
import { toMajorVersionIntegration } from '@datadog/browser-core'
import type { RumInitConfiguration, RumPluginOnInitOptions, RumPublicApi } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '../../../browser-core/test'
import { addAngularErrorWhenReady, angularPlugin, resetAngularPlugin, startAngularViewWhenReady } from './angularPlugin'

const PUBLIC_API = {} as RumPublicApi
const INIT_CONFIGURATION = {} as RumInitConfiguration
const ERROR_PAYLOAD = { error: new Error('foo') } as Parameters<typeof addAngularErrorWhenReady>[0]

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
        onRumStart: jasmine.any(Function),
      })
    )
  })

  it('starts views reported before onInit when onInit is called', () => {
    const startView = jasmine.createSpy()
    const publicApi = { startView } as unknown as RumPublicApi
    startAngularViewWhenReady({ name: '/foo', url: '/foo' })
    expect(startView).not.toHaveBeenCalled()

    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- onInit never returns a promise for this plugin
    angularPlugin({ router: true }).onInit!({
      publicApi,
      initConfiguration: { ...INIT_CONFIGURATION },
    } as RumPluginOnInitOptions)

    expect(startView).toHaveBeenCalledOnceWith({ name: '/foo', url: '/foo' })
  })

  it('only starts the latest view reported before onInit', () => {
    const startView = jasmine.createSpy()
    const publicApi = { startView } as unknown as RumPublicApi
    startAngularViewWhenReady({ name: '/foo', url: '/foo' })
    startAngularViewWhenReady({ name: '/bar', url: '/bar' })

    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- onInit never returns a promise for this plugin
    angularPlugin({ router: true }).onInit!({
      publicApi,
      initConfiguration: { ...INIT_CONFIGURATION },
    } as RumPluginOnInitOptions)

    expect(startView).toHaveBeenCalledOnceWith({ name: '/bar', url: '/bar' })
  })

  it('starts views right away once onInit was called', () => {
    const startView = jasmine.createSpy()
    const publicApi = { startView } as unknown as RumPublicApi
    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- onInit never returns a promise for this plugin
    angularPlugin({ router: true }).onInit!({
      publicApi,
      initConfiguration: { ...INIT_CONFIGURATION },
    } as RumPluginOnInitOptions)

    startAngularViewWhenReady({ name: '/foo', url: '/foo' })

    expect(startView).toHaveBeenCalledOnceWith({ name: '/foo', url: '/foo' })
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

  it('adds errors reported before onRumStart when onRumStart is called', () => {
    const addError = jasmine.createSpy()
    addAngularErrorWhenReady(ERROR_PAYLOAD)
    expect(addError).not.toHaveBeenCalled()

    angularPlugin().onRumStart!({ addError })

    expect(addError).toHaveBeenCalledOnceWith(ERROR_PAYLOAD)
  })

  it('keeps the 500 latest errors reported before onRumStart', () => {
    const addError = jasmine.createSpy()
    for (let i = 0; i < 501; i++) {
      addAngularErrorWhenReady({ ...ERROR_PAYLOAD, context: { i } })
    }

    angularPlugin().onRumStart!({ addError })

    expect(addError).toHaveBeenCalledTimes(500)
    expect(addError.calls.first().args[0].context).toEqual({ i: 1 })
  })

  it('adds errors right away once onRumStart was called', () => {
    const addError = jasmine.createSpy()
    angularPlugin().onRumStart!({ addError })

    addAngularErrorWhenReady(ERROR_PAYLOAD)

    expect(addError).toHaveBeenCalledOnceWith(ERROR_PAYLOAD)
  })
})
