import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'
import type { SalesforceLocation } from './viewNameTracker'
import { startSalesforceViewNameTracking } from './viewNameTracker'

describe('salesforce view name tracker', () => {
  let clock: Clock
  let setViewName: jasmine.Spy
  let startView: jasmine.Spy
  let location: SalesforceLocation | undefined
  let subscription: ReturnType<typeof startSalesforceViewNameTracking> | undefined

  beforeEach(() => {
    clock = mockClock()
    setViewName = jasmine.createSpy()
    startView = jasmine.createSpy()
    history.replaceState({}, '', '/lightning/page/home')
    location = {
      pathname: '/lightning/page/home',
      href: 'https://example.lightning.force.com/lightning/page/home',
    }
  })

  afterEach(() => {
    subscription?.stop()
    history.replaceState({}, '', '/')
  })

  it('sets the current Salesforce view name on bootstrap', () => {
    subscription = startSalesforceViewNameTracking({
      getRumPublicApi: () => ({ setViewName, startView }),
      getLocation: () => location,
    })

    expect(setViewName).toHaveBeenCalledOnceWith('/lightning/page/home')
    expect(startView).not.toHaveBeenCalled()
  })

  it('falls back to the href pathname when pathname is unavailable', () => {
    location = {
      href: 'https://example.lightning.force.com/lightning/n/Product_Explorer/',
    }

    subscription = startSalesforceViewNameTracking({
      getRumPublicApi: () => ({ setViewName, startView }),
      getLocation: () => location,
    })

    expect(setViewName).toHaveBeenCalledOnceWith('/lightning/n/Product_Explorer')
    expect(startView).not.toHaveBeenCalled()
  })

  it('starts a route-change view after a history navigation changes the Salesforce pathname', () => {
    subscription = startSalesforceViewNameTracking({
      getRumPublicApi: () => ({ setViewName, startView }),
      getLocation: () => location,
    })
    setViewName.calls.reset()

    location = {
      pathname: '/lightning/n/Product_Explorer',
      href: 'https://example.lightning.force.com/lightning/n/Product_Explorer',
    }
    history.pushState({}, '', '/lightning/n/Product_Explorer')
    clock.tick(0)

    expect(setViewName).not.toHaveBeenCalled()
    expect(startView).toHaveBeenCalledOnceWith({
      name: '/lightning/n/Product_Explorer',
      url: 'https://example.lightning.force.com/lightning/n/Product_Explorer',
    })
  })

  it('checks for async Salesforce navigation after clicks', () => {
    subscription = startSalesforceViewNameTracking({
      getRumPublicApi: () => ({ setViewName, startView }),
      getLocation: () => location,
    })

    location = {
      pathname: '/lightning/n/Product_Explorer',
      href: 'https://example.lightning.force.com/lightning/n/Product_Explorer',
    }
    window.dispatchEvent(new MouseEvent('click'))
    clock.tick(100)

    expect(startView).toHaveBeenCalledOnceWith({
      name: '/lightning/n/Product_Explorer',
      url: 'https://example.lightning.force.com/lightning/n/Product_Explorer',
    })
  })
})
