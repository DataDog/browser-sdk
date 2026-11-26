import { WATCH_COOKIE_INTERVAL_DELAY } from '@datadog/browser-core'
import { mockClock, waitNextMicrotask } from '@datadog/browser-core/test'
import { createShopifyCookieAccess } from './shopifyCookieAccess'

describe('createShopifyCookieAccess', () => {
  function setup(initialValue = '') {
    let value = initialValue
    const cookieStore = {
      get: jasmine.createSpy('get').and.callFake(() => Promise.resolve(value)),
      set: jasmine.createSpy('set').and.returnValue(Promise.resolve('')),
    }
    const cookieAccess = createShopifyCookieAccess(cookieStore, '_dd_s_v2', {})
    return { cookieStore, cookieAccess, setValue: (newValue: string) => (value = newValue) }
  }

  it('reads the cookie value from the cookie store', async () => {
    const { cookieStore, cookieAccess } = setup('id=abc')

    expect(await cookieAccess.getAll()).toEqual(['id=abc'])
    expect(cookieStore.get).toHaveBeenCalledWith('_dd_s_v2')
  })

  it('returns no value when the cookie is not set', async () => {
    const { cookieAccess } = setup()

    expect(await cookieAccess.getAll()).toEqual([])
  })

  it('writes the value computed from the current one, with the cookie attributes', async () => {
    const { cookieStore, cookieAccess } = setup('id=abc')

    await cookieAccess.getAllAndSet((values) => ({ value: `${values[0]}&expire=1`, expireDelay: 1000 }))

    expect(cookieStore.set).toHaveBeenCalledOnceWith(
      jasmine.stringMatching(/^_dd_s_v2=id=abc&expire=1;expires=[^;]+;path=\/;samesite=strict$/)
    )
  })

  it('deletes the cookie with an expired empty value', async () => {
    const { cookieStore, cookieAccess } = setup('id=abc')

    await cookieAccess.delete()

    expect(cookieStore.set).toHaveBeenCalledOnceWith(jasmine.stringMatching(/^_dd_s_v2=;expires=/))
  })

  it('notifies when the cookie is changed from another context', async () => {
    const clock = mockClock()
    const { cookieAccess, setValue } = setup('id=abc')
    const spy = jasmine.createSpy('change')
    cookieAccess.observable.subscribe(spy)

    clock.tick(WATCH_COOKIE_INTERVAL_DELAY)
    await waitNextMicrotask()
    await waitNextMicrotask()
    expect(spy).not.toHaveBeenCalled()

    setValue('id=def')
    clock.tick(WATCH_COOKIE_INTERVAL_DELAY)
    await waitNextMicrotask()
    await waitNextMicrotask()
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
