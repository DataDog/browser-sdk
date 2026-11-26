import { WATCH_COOKIE_INTERVAL_DELAY } from '@datadog/browser-core'
import { mockClock, waitNextMicrotask } from '@datadog/browser-core/test'
import { createFakeShopifyCookie } from '../../../test/mockShopifyCookie'
import { createShopifyCookieAccess } from './shopifyCookieAccess'

describe('createShopifyCookieAccess', () => {
  function setup(initialValue?: string) {
    const clock = mockClock()
    const { cookies, cookieStore } = createFakeShopifyCookie()
    if (initialValue) {
      cookies.set('_dd_s_v2', initialValue)
    }
    return {
      cookies,
      cookieStore,
      cookieAccess: createShopifyCookieAccess(cookieStore, '_dd_s_v2', {}),
      pollCookie: async () => {
        clock.tick(WATCH_COOKIE_INTERVAL_DELAY)
        await waitNextMicrotask()
        await waitNextMicrotask()
      },
    }
  }

  it('reads the cookie value from the cookie store', async () => {
    expect(await setup('id=abc').cookieAccess.getAll()).toEqual(['id=abc'])
  })

  it('returns no value when the cookie is not set', async () => {
    expect(await setup().cookieAccess.getAll()).toEqual([])
  })

  it('writes the value computed from the current one, with the cookie attributes', async () => {
    const { cookies, cookieStore, cookieAccess } = setup('id=abc')

    await cookieAccess.getAllAndSet((values) => ({ value: `${values[0]}&expire=1`, expireDelay: 1000 }))

    expect(cookies.get('_dd_s_v2')).toBe('id=abc&expire=1')
    expect(cookieStore.set).toHaveBeenCalledOnceWith(
      jasmine.stringMatching(/^_dd_s_v2=id=abc&expire=1;expires=[^;]+;path=\/;samesite=strict$/)
    )
  })

  it('deletes the cookie', async () => {
    const { cookies, cookieAccess } = setup('id=abc')

    await cookieAccess.delete()

    expect(cookies.has('_dd_s_v2')).toBeFalse()
  })

  it('notifies when the cookie is changed from another context', async () => {
    const { cookies, cookieAccess, pollCookie } = setup('id=abc')
    const spy = jasmine.createSpy('change')
    cookieAccess.observable.subscribe(spy)

    await pollCookie()
    expect(spy).not.toHaveBeenCalled()

    cookies.set('_dd_s_v2', 'id=def')
    await pollCookie()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('notifies after writing a new value', async () => {
    const { cookieAccess } = setup('id=abc')
    const spy = jasmine.createSpy('change')
    cookieAccess.observable.subscribe(spy)

    await cookieAccess.getAllAndSet(() => ({ value: 'id=abc', expireDelay: 1000 }))
    expect(spy).not.toHaveBeenCalled()

    await cookieAccess.getAllAndSet(() => ({ value: 'id=def', expireDelay: 1000 }))
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
