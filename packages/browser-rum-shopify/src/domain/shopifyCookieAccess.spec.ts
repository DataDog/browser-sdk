import { mockClock, waitNextMicrotask } from '@datadog/browser-core/test'
import { createShopifyCookieAccessFactory, WATCH_SHOPIFY_COOKIE_INTERVAL_DELAY } from './shopifyCookieAccess'

describe('createShopifyCookieAccessFactory', () => {
  function setup(initialValue = '') {
    let value = initialValue
    const browser = {
      cookie: {
        get: jasmine.createSpy('get').and.callFake(() => Promise.resolve(value)),
        set: jasmine.createSpy('set').and.returnValue(Promise.resolve('')),
      },
    }
    const cookieAccess = createShopifyCookieAccessFactory(browser)('_dd_s_v2', {})
    return { browser, cookieAccess, setValue: (newValue: string) => (value = newValue) }
  }

  it('reads the cookie value from the top frame', async () => {
    const { browser, cookieAccess } = setup('id=abc')

    expect(await cookieAccess.getAll()).toEqual(['id=abc'])
    expect(browser.cookie.get).toHaveBeenCalledWith('_dd_s_v2')
  })

  it('returns no value when the cookie is not set', async () => {
    const { cookieAccess } = setup()

    expect(await cookieAccess.getAll()).toEqual([])
  })

  it('writes the value computed from the current one, with the cookie attributes', async () => {
    const { browser, cookieAccess } = setup('id=abc')

    await cookieAccess.getAllAndSet((values) => ({ value: `${values[0]}&expire=1`, expireDelay: 1000 }))

    expect(browser.cookie.set).toHaveBeenCalledOnceWith(
      jasmine.stringMatching(/^_dd_s_v2=id=abc&expire=1;expires=[^;]+;path=\/;samesite=strict$/)
    )
  })

  it('deletes the cookie with an expired empty value', async () => {
    const { browser, cookieAccess } = setup('id=abc')

    await cookieAccess.delete()

    expect(browser.cookie.set).toHaveBeenCalledOnceWith(jasmine.stringMatching(/^_dd_s_v2=;expires=/))
  })

  it('notifies when the cookie is changed from another context', async () => {
    const clock = mockClock()
    const { cookieAccess, setValue } = setup('id=abc')
    const spy = jasmine.createSpy('change')
    cookieAccess.observable.subscribe(spy)

    clock.tick(WATCH_SHOPIFY_COOKIE_INTERVAL_DELAY)
    await waitNextMicrotask()
    await waitNextMicrotask()
    expect(spy).not.toHaveBeenCalled()

    setValue('id=def')
    clock.tick(WATCH_SHOPIFY_COOKIE_INTERVAL_DELAY)
    await waitNextMicrotask()
    await waitNextMicrotask()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
