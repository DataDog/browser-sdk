import { initializeSvelteKitPlugin } from '../../../test/initializeSvelteKitPlugin'
import type { Navigation, NavigationTarget } from './types'
import { trackSvelteKitNavigation } from './svelteKitRouter'

function makeTarget(routeId: string | null, pathname: string): NavigationTarget {
  return {
    url: new URL(`http://localhost${pathname}`),
    route: { id: routeId },
    params: {},
  }
}

function makeNavigation(partial: Partial<Navigation>): Navigation {
  return {
    from: null,
    to: null,
    type: 'link',
    willUnload: false,
    complete: Promise.resolve(),
    ...partial,
  }
}

describe('trackSvelteKitNavigation', () => {
  it('calls startView on the initial navigation (from === null, type === enter)', () => {
    const startViewSpy = jasmine.createSpy()
    initializeSvelteKitPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    trackSvelteKitNavigation(
      makeNavigation({
        from: null,
        to: makeTarget('/', '/'),
        type: 'enter',
      })
    )

    expect(startViewSpy).toHaveBeenCalledOnceWith('/')
  })

  it('calls startView on a subsequent navigation', () => {
    const startViewSpy = jasmine.createSpy()
    initializeSvelteKitPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    trackSvelteKitNavigation(
      makeNavigation({
        from: makeTarget('/', '/'),
        to: makeTarget('/about', '/about'),
      })
    )

    expect(startViewSpy).toHaveBeenCalledOnceWith('/about')
  })

  it('does not call startView when only query params change', () => {
    const startViewSpy = jasmine.createSpy()
    initializeSvelteKitPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    trackSvelteKitNavigation(
      makeNavigation({
        from: makeTarget('/products', '/products?page=1'),
        to: makeTarget('/products', '/products?page=2'),
      })
    )

    expect(startViewSpy).not.toHaveBeenCalled()
  })

  it('does not call startView when navigation.to is null', () => {
    const startViewSpy = jasmine.createSpy()
    initializeSvelteKitPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    trackSvelteKitNavigation(
      makeNavigation({
        from: makeTarget('/', '/'),
        to: null,
        type: 'leave',
        willUnload: true,
      })
    )

    expect(startViewSpy).not.toHaveBeenCalled()
  })

  it('falls back to pathname when route.id is null (unmatched / 404)', () => {
    const startViewSpy = jasmine.createSpy()
    initializeSvelteKitPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    trackSvelteKitNavigation(
      makeNavigation({
        from: makeTarget('/', '/'),
        to: makeTarget(null, '/does-not-exist'),
      })
    )

    expect(startViewSpy).toHaveBeenCalledOnceWith('/does-not-exist')
  })

  it('preserves route groups and bracket syntax in the view name', () => {
    const startViewSpy = jasmine.createSpy()
    initializeSvelteKitPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    trackSvelteKitNavigation(
      makeNavigation({
        from: makeTarget('/', '/'),
        to: makeTarget('/(app)/dashboard', '/dashboard'),
      })
    )

    expect(startViewSpy).toHaveBeenCalledOnceWith('/(app)/dashboard')
  })
})
