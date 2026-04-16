import { Subject } from 'rxjs'
import { registerCleanupTask } from '../../../../core/test'
import { initializeAngularPlugin } from '../../../../test/initializeAngularPlugin'
import type { ResolveStartLike } from './angularRouter'
import { trackRouterViews } from './angularRouter'
import type { AngularActivatedRouteSnapshot } from './types'

function createResolveStartEvent(
  routeConfigs: Array<{ path?: string } | null>,
  urlAfterRedirects: string
): ResolveStartLike {
  const snapshots: AngularActivatedRouteSnapshot[] = routeConfigs.map(() => ({
    routeConfig: null,
    firstChild: null,
    pathFromRoot: [],
  }))

  for (let i = 0; i < snapshots.length; i++) {
    snapshots[i].routeConfig = routeConfigs[i]
    snapshots[i].pathFromRoot = snapshots.slice(0, i + 1)
    snapshots[i].firstChild = snapshots[i + 1] || null
  }

  return {
    urlAfterRedirects,
    state: { root: snapshots[0] },
  }
}

describe('trackRouterViews', () => {
  let events$: Subject<ResolveStartLike>

  beforeEach(() => {
    events$ = new Subject()
  })

  it('calls startView on navigation', () => {
    const startViewSpy = jasmine.createSpy()
    initializeAngularPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    const subscription = trackRouterViews(events$)
    registerCleanupTask(() => subscription.unsubscribe())

    events$.next(createResolveStartEvent([{ path: '' }, { path: 'about' }], '/about'))

    expect(startViewSpy).toHaveBeenCalledOnceWith('/about')
  })

  it('calls startView with parameterized view name', () => {
    const startViewSpy = jasmine.createSpy()
    initializeAngularPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    const subscription = trackRouterViews(events$)
    registerCleanupTask(() => subscription.unsubscribe())

    events$.next(createResolveStartEvent([{ path: '' }, { path: 'user/:id' }], '/user/42'))

    expect(startViewSpy).toHaveBeenCalledOnceWith('/user/:id')
  })

  it('does not call startView when only query params change', () => {
    const startViewSpy = jasmine.createSpy()
    initializeAngularPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    const subscription = trackRouterViews(events$)
    registerCleanupTask(() => subscription.unsubscribe())

    events$.next(createResolveStartEvent([{ path: '' }, { path: 'products' }], '/products?page=1'))
    startViewSpy.calls.reset()

    events$.next(createResolveStartEvent([{ path: '' }, { path: 'products' }], '/products?page=2'))

    expect(startViewSpy).not.toHaveBeenCalled()
  })

  it('does not call startView when only hash changes', () => {
    const startViewSpy = jasmine.createSpy()
    initializeAngularPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    const subscription = trackRouterViews(events$)
    registerCleanupTask(() => subscription.unsubscribe())

    events$.next(createResolveStartEvent([{ path: '' }, { path: 'docs' }], '/docs#section1'))
    startViewSpy.calls.reset()

    events$.next(createResolveStartEvent([{ path: '' }, { path: 'docs' }], '/docs#section2'))

    expect(startViewSpy).not.toHaveBeenCalled()
  })

  it('calls startView on initial navigation to /', () => {
    const startViewSpy = jasmine.createSpy()
    initializeAngularPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    const subscription = trackRouterViews(events$)
    registerCleanupTask(() => subscription.unsubscribe())

    events$.next(createResolveStartEvent([{ path: '' }], '/'))

    expect(startViewSpy).toHaveBeenCalledOnceWith('/')
  })

  it('substitutes catch-all pattern with the actual path', () => {
    const startViewSpy = jasmine.createSpy()
    initializeAngularPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    const subscription = trackRouterViews(events$)
    registerCleanupTask(() => subscription.unsubscribe())

    events$.next(createResolveStartEvent([{ path: '' }, { path: '**' }], '/unknown/page'))

    expect(startViewSpy).toHaveBeenCalledOnceWith('/unknown/page')
  })

  it('tracks multiple navigations', () => {
    const startViewSpy = jasmine.createSpy()
    initializeAngularPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    const subscription = trackRouterViews(events$)
    registerCleanupTask(() => subscription.unsubscribe())

    events$.next(createResolveStartEvent([{ path: '' }], '/'))
    events$.next(createResolveStartEvent([{ path: '' }, { path: 'about' }], '/about'))

    expect(startViewSpy).toHaveBeenCalledWith('/')
    expect(startViewSpy).toHaveBeenCalledWith('/about')
    expect(startViewSpy.calls.count()).toBe(2)
  })

  it('traverses to the deepest activated route', () => {
    const startViewSpy = jasmine.createSpy()
    initializeAngularPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    const subscription = trackRouterViews(events$)
    registerCleanupTask(() => subscription.unsubscribe())

    events$.next(
      createResolveStartEvent([{ path: '' }, { path: 'product/:id' }, { path: 'reviews' }], '/product/42/reviews')
    )

    expect(startViewSpy).toHaveBeenCalledOnceWith('/product/:id/reviews')
  })
})
