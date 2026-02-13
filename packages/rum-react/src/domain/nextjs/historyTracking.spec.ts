import { registerCleanupTask } from '../../../../core/test'
import { setupHistoryTracking } from './historyTracking'

describe('setupHistoryTracking', () => {
  let onNavigationSpy: jasmine.Spy<(pathname: string) => void>
  let cleanup: () => void
  let originalPushState: History['pushState']
  let originalReplaceState: History['replaceState']

  beforeEach(() => {
    onNavigationSpy = jasmine.createSpy('onNavigation')
    originalPushState = history.pushState.bind(history)
    originalReplaceState = history.replaceState.bind(history)

    registerCleanupTask(() => {
      if (cleanup) {
        cleanup()
      }
      history.pushState = originalPushState
      history.replaceState = originalReplaceState
    })
  })
  ;[
    { method: 'pushState' as const, url: '/new-path', expected: '/new-path' },
    { method: 'replaceState' as const, url: '/replaced-path', expected: '/replaced-path' },
    { method: 'pushState' as const, url: '/user/42?tab=profile', expected: '/user/42' },
  ].forEach(({ method, url, expected }) => {
    it(`calls callback with ${expected} when ${method} is called with ${url}`, () => {
      cleanup = setupHistoryTracking(onNavigationSpy)

      history[method]({}, '', url)

      expect(onNavigationSpy).toHaveBeenCalledWith(expected)
    })
  })

  it('calls callback on popstate event', () => {
    cleanup = setupHistoryTracking(onNavigationSpy)

    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(onNavigationSpy).toHaveBeenCalledWith(window.location.pathname)
  })

  it('does not call callback when URL is null', () => {
    cleanup = setupHistoryTracking(onNavigationSpy)

    history.pushState({ data: 'test' }, '')

    expect(onNavigationSpy).not.toHaveBeenCalled()
  })
  ;[
    { name: 'pushState', trigger: () => history.pushState({}, '', '/after-cleanup') },
    { name: 'replaceState', trigger: () => history.replaceState({}, '', '/after-cleanup') },
    { name: 'popstate', trigger: () => window.dispatchEvent(new PopStateEvent('popstate')) },
  ].forEach(({ name, trigger }) => {
    it(`does not call callback after cleanup when ${name} is triggered`, () => {
      cleanup = setupHistoryTracking(onNavigationSpy)
      cleanup()

      trigger()

      expect(onNavigationSpy).not.toHaveBeenCalled()
    })
  })

  it('tracks multiple navigations', () => {
    cleanup = setupHistoryTracking(onNavigationSpy)

    history.pushState({}, '', '/page1')
    history.pushState({}, '', '/page2')
    history.replaceState({}, '', '/page3')

    expect(onNavigationSpy).toHaveBeenCalledTimes(3)
    expect(onNavigationSpy.calls.argsFor(0)).toEqual(['/page1'])
    expect(onNavigationSpy.calls.argsFor(1)).toEqual(['/page2'])
    expect(onNavigationSpy.calls.argsFor(2)).toEqual(['/page3'])
  })
})
