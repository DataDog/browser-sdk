import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'
import { startSalesforceViewTracking } from './salesforceViewTracker'

describe('salesforce view tracker', () => {
  let clock: Clock
  let startView: jasmine.Spy
  let location: { pathname?: string; href?: string } | undefined

  beforeEach(() => {
    clock = mockClock()
    startView = jasmine.createSpy()
    location = {
      pathname: '/lightning/page/home',
      href: 'https://example.lightning.force.com/lightning/page/home',
    }
  })

  it('starts the current Lightning view on bootstrap', () => {
    startSalesforceViewTracking({
      getRumPublicApi: () => ({ startView }),
      getLocation: () => location,
    })

    expect(startView).toHaveBeenCalledOnceWith({
      name: '/lightning/page/home',
      url: 'https://example.lightning.force.com/lightning/page/home',
    })
  })

  it('does not duplicate the same pathname when only query string or hash changes', () => {
    startSalesforceViewTracking({
      getRumPublicApi: () => ({ startView }),
      getLocation: () => location,
      pollInterval: 500,
    })

    location = {
      pathname: '/lightning/page/home/',
      href: 'https://example.lightning.force.com/lightning/page/home?foo=bar#hash',
    }
    clock.tick(500)

    expect(startView).toHaveBeenCalledTimes(1)
  })

  it('starts a new view when polling detects a Lightning pathname change', () => {
    startSalesforceViewTracking({
      getRumPublicApi: () => ({ startView }),
      getLocation: () => location,
      pollInterval: 500,
    })

    location = {
      pathname: '/lightning/n/Product_Explorer',
      href: 'https://example.lightning.force.com/lightning/n/Product_Explorer',
    }
    clock.tick(500)

    expect(startView).toHaveBeenCalledTimes(2)
    expect(startView.calls.argsFor(1)).toEqual([
      {
        name: '/lightning/n/Product_Explorer',
        url: 'https://example.lightning.force.com/lightning/n/Product_Explorer',
      },
    ])
  })

  it('keeps polling when location is temporarily unavailable', () => {
    location = undefined

    startSalesforceViewTracking({
      getRumPublicApi: () => ({ startView }),
      getLocation: () => location,
      pollInterval: 500,
    })

    expect(startView).not.toHaveBeenCalled()

    location = {
      pathname: '/lightning/page/home',
      href: 'https://example.lightning.force.com/lightning/page/home',
    }
    clock.tick(500)

    expect(startView).toHaveBeenCalledOnceWith({
      name: '/lightning/page/home',
      url: 'https://example.lightning.force.com/lightning/page/home',
    })
  })

  it('stops polling', () => {
    const subscription = startSalesforceViewTracking({
      getRumPublicApi: () => ({ startView }),
      getLocation: () => location,
      pollInterval: 500,
    })

    subscription.stop()
    location = {
      pathname: '/lightning/n/Product_Explorer',
      href: 'https://example.lightning.force.com/lightning/n/Product_Explorer',
    }
    clock.tick(500)

    expect(startView).toHaveBeenCalledTimes(1)
  })
})
