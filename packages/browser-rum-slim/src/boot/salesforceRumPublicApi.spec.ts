import type { RumInitConfiguration, RumPlugin, RumPublicApi } from '@datadog/browser-rum-core'
import { makeSalesforceRumPublicApi } from './salesforceRumPublicApi'

describe('makeSalesforceRumPublicApi', () => {
  it('forces sessionReplaySampleRate to 0 when initializing', () => {
    const initSpy = jasmine.createSpy<(initConfiguration: RumInitConfiguration) => void>()
    const rumPublicApi = {
      init: initSpy,
      version: 'test',
      onReady: () => undefined,
    } as unknown as RumPublicApi

    makeSalesforceRumPublicApi(rumPublicApi).init({
      applicationId: 'application-id',
      clientToken: 'client-token',
      sessionReplaySampleRate: 100,
    })

    expect(initSpy).toHaveBeenCalledOnceWith({
      applicationId: 'application-id',
      clientToken: 'client-token',
      sessionReplaySampleRate: 0,
      plugins: [jasmine.objectContaining({ name: 'salesforce' })],
    })
  })

  it('adds a salesforce plugin telemetry marker when initializing', () => {
    const initSpy = jasmine.createSpy<(initConfiguration: RumInitConfiguration) => void>()
    const plugin = { name: 'foo' } satisfies RumPlugin
    const pluginsConfiguration = [plugin]
    const rumPublicApi = {
      init: initSpy,
      version: 'test',
      onReady: () => undefined,
    } as unknown as RumPublicApi

    makeSalesforceRumPublicApi(rumPublicApi).init({
      applicationId: 'application-id',
      clientToken: 'client-token',
      plugins: pluginsConfiguration,
    })

    const plugins = initSpy.calls.mostRecent().args[0].plugins!
    expect(plugins).toEqual([plugin, jasmine.objectContaining({ name: 'salesforce' })])
    expect(plugins[1].getConfigurationTelemetry!()).toEqual({ salesforce: true })
    expect(plugins).not.toBe(pluginsConfiguration)
    expect(pluginsConfiguration).toEqual([plugin])
  })

  it('adds a salesforce plugin telemetry marker when no plugins are configured', () => {
    const initSpy = jasmine.createSpy<(initConfiguration: RumInitConfiguration) => void>()
    const rumPublicApi = {
      init: initSpy,
      version: 'test',
      onReady: () => undefined,
    } as unknown as RumPublicApi

    makeSalesforceRumPublicApi(rumPublicApi).init({
      applicationId: 'application-id',
      clientToken: 'client-token',
    })

    const plugins = initSpy.calls.mostRecent().args[0].plugins!
    expect(plugins).toEqual([jasmine.objectContaining({ name: 'salesforce' })])
    expect(plugins[0].getConfigurationTelemetry!()).toEqual({ salesforce: true })
  })

  it('does not mutate the init configuration plugins', () => {
    const initSpy = jasmine.createSpy<(initConfiguration: RumInitConfiguration) => void>()
    const plugin = { name: 'foo' } satisfies RumPlugin
    const initConfiguration: RumInitConfiguration = {
      applicationId: 'application-id',
      clientToken: 'client-token',
      plugins: [plugin],
    }
    const rumPublicApi = {
      init: initSpy,
      version: 'test',
      onReady: () => undefined,
    } as unknown as RumPublicApi

    makeSalesforceRumPublicApi(rumPublicApi).init(initConfiguration)

    expect(initConfiguration.plugins).toEqual([plugin])
    expect(initSpy.calls.mostRecent().args[0].plugins).not.toBe(initConfiguration.plugins)
  })

  it('preserves the public api object', () => {
    const rumPublicApi = {
      init: () => undefined,
      version: 'test',
      onReady: () => undefined,
    } as unknown as RumPublicApi

    expect(makeSalesforceRumPublicApi(rumPublicApi)).toBe(rumPublicApi)
    expect(rumPublicApi.version).toBe('test')
    expect(rumPublicApi.onReady).toEqual(jasmine.any(Function))
  })
})
