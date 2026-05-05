import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'
import { subscribeToSalesforceResourcePoll } from './resourcePollChannel'
import { startSalesforceViewTracking } from './viewTracker'

describe('salesforce view tracker', () => {
  let clock: Clock
  let startView: jasmine.Spy
  let setViewLoadingTime: jasmine.Spy
  let location: { pathname?: string; href?: string } | undefined
  let performanceEntries: Array<{ responseEnd?: number }>

  beforeEach(() => {
    clock = mockClock()
    startView = jasmine.createSpy()
    setViewLoadingTime = jasmine.createSpy()
    location = {
      pathname: '/lightning/page/home',
      href: 'https://example.lightning.force.com/lightning/page/home',
    }
    performanceEntries = []
  })

  it('starts the current Lightning view on bootstrap', () => {
    startSalesforceViewTracking({
      getRumPublicApi: () => ({ startView, setViewLoadingTime }),
      getLocation: () => location,
      getPerformanceEntries: () => performanceEntries,
    })

    expect(startView).toHaveBeenCalledOnceWith({
      name: '/lightning/page/home',
      url: 'https://example.lightning.force.com/lightning/page/home',
    })
  })

  it('does not duplicate the same pathname when only query string or hash changes', () => {
    startSalesforceViewTracking({
      getRumPublicApi: () => ({ startView, setViewLoadingTime }),
      getLocation: () => location,
      getPerformanceEntries: () => performanceEntries,
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
      getRumPublicApi: () => ({ startView, setViewLoadingTime }),
      getLocation: () => location,
      getPerformanceEntries: () => performanceEntries,
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
      getRumPublicApi: () => ({ startView, setViewLoadingTime }),
      getLocation: () => location,
      getPerformanceEntries: () => performanceEntries,
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
      getRumPublicApi: () => ({ startView, setViewLoadingTime }),
      getLocation: () => location,
      getPerformanceEntries: () => performanceEntries,
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

  it('sets the view loading time after one idle polling interval', () => {
    startSalesforceViewTracking({
      getRumPublicApi: () => ({ startView, setViewLoadingTime }),
      getLocation: () => location,
      getPerformanceEntries: () => performanceEntries,
      pollInterval: 500,
    })

    performanceEntries = [{ responseEnd: 100 }]
    clock.tick(500)

    expect(setViewLoadingTime).not.toHaveBeenCalled()

    clock.tick(500)

    expect(setViewLoadingTime).toHaveBeenCalledOnceWith()
  })

  it('replaces the pending loading time candidate when a later resource is detected', () => {
    startSalesforceViewTracking({
      getRumPublicApi: () => ({ startView, setViewLoadingTime }),
      getLocation: () => location,
      getPerformanceEntries: () => performanceEntries,
      pollInterval: 500,
    })

    performanceEntries = [{ responseEnd: 100 }]
    clock.tick(500)

    performanceEntries = [{ responseEnd: 100 }, { responseEnd: 700 }]
    clock.tick(500)

    expect(setViewLoadingTime).not.toHaveBeenCalled()

    clock.tick(500)

    expect(setViewLoadingTime).toHaveBeenCalledOnceWith()
  })

  it('resets the resource timing state when a new Salesforce view starts', () => {
    startSalesforceViewTracking({
      getRumPublicApi: () => ({ startView, setViewLoadingTime }),
      getLocation: () => location,
      getPerformanceEntries: () => performanceEntries,
      pollInterval: 500,
    })

    performanceEntries = [{ responseEnd: 100 }]
    clock.tick(500)
    clock.tick(500)

    expect(setViewLoadingTime).toHaveBeenCalledOnceWith()

    location = {
      pathname: '/lightning/n/Product_Explorer',
      href: 'https://example.lightning.force.com/lightning/n/Product_Explorer',
    }
    performanceEntries = [{ responseEnd: 100 }, { responseEnd: 1700 }]
    clock.tick(500)

    expect(startView).toHaveBeenCalledTimes(2)
    expect(setViewLoadingTime).toHaveBeenCalledTimes(1)

    clock.tick(500)

    expect(setViewLoadingTime).toHaveBeenCalledTimes(2)
    expect(setViewLoadingTime.calls.argsFor(1)).toEqual([])
  })

  it('ignores loading time collection when performance entries are unavailable', () => {
    startSalesforceViewTracking({
      getRumPublicApi: () => ({ startView, setViewLoadingTime }),
      getLocation: () => location,
      getPerformanceEntries: () => undefined,
      pollInterval: 500,
    })

    clock.tick(1000)

    expect(setViewLoadingTime).not.toHaveBeenCalled()
  })

  it('publishes the latest tracked Salesforce view and performance entries on each poll', () => {
    const polls: Array<{
      currentView: { startRelativeTime: number } | undefined
      resourceEntries: Array<{ responseEnd?: number }> | undefined
    }> = []
    const subscription = subscribeToSalesforceResourcePoll((poll) => {
      polls.push(poll)
    })

    startSalesforceViewTracking({
      getRumPublicApi: () => ({ startView, setViewLoadingTime }),
      getLocation: () => location,
      getPerformanceEntries: () => performanceEntries,
      pollInterval: 500,
    })

    expect(polls[0]).toEqual({
      currentView: { startRelativeTime: jasmine.any(Number) },
      resourceEntries: [],
    })

    const initialViewStart = polls[0].currentView!.startRelativeTime

    location = {
      pathname: '/lightning/n/Product_Explorer',
      href: 'https://example.lightning.force.com/lightning/n/Product_Explorer',
    }
    performanceEntries = [{ responseEnd: 700 }]
    clock.tick(500)

    expect(polls[polls.length - 1]).toEqual({
      currentView: { startRelativeTime: jasmine.any(Number) },
      resourceEntries: [{ responseEnd: 700 }],
    })
    expect(polls[polls.length - 1].currentView!.startRelativeTime).toBeGreaterThan(initialViewStart)

    subscription.unsubscribe()
  })
})
