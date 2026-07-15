import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
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
    })
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
