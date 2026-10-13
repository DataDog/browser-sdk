import { display } from '@datadog/browser-core'
import { replaceMockable } from '@datadog/browser-core/test'
import { createFakeAnalytics } from '../../test/mockShopifyAnalytics'
import { startRegisteredWebPixel } from './startRegisteredWebPixel'
import { startWebPixelRum } from './startWebPixelRum'

describe('startRegisteredWebPixel', () => {
  function setup(rumConfig: unknown = '{"applicationId":"test","clientToken":"test"}') {
    const api = {
      analytics: createFakeAnalytics().analytics,
      browser: { cookie: { get: () => Promise.resolve(''), set: () => Promise.resolve('') } },
      init: { customerPrivacy: { analyticsProcessingAllowed: true } },
      customerPrivacy: { subscribe: jasmine.createSpy() },
      settings: { rumConfig },
    }
    const start = jasmine.createSpy<typeof startWebPixelRum>().and.returnValue({
      addAction: jasmine.createSpy(),
      addError: jasmine.createSpy(),
    })
    replaceMockable(startWebPixelRum, start)
    const error = spyOn(display, 'error')
    return { api, start, error }
  }

  it('passes configuration and the original Shopify APIs to RUM', () => {
    const { api, start, error } = setup()

    startRegisteredWebPixel(api)

    expect(start).toHaveBeenCalledOnceWith({ applicationId: 'test', clientToken: 'test' }, api, jasmine.any(Function))
    expect(start.calls.first().args[1].browser).toBe(api.browser)
    expect(error).not.toHaveBeenCalled()
  })

  for (const rumConfig of [null, '{invalid-json']) {
    it(`does not start RUM with invalid settings: ${String(rumConfig)}`, () => {
      const { api, start, error } = setup(rumConfig)

      startRegisteredWebPixel(api)

      expect(start).not.toHaveBeenCalled()
      expect(error).toHaveBeenCalledWith(jasmine.stringMatching(/valid JSON/))
    })
  }
})
