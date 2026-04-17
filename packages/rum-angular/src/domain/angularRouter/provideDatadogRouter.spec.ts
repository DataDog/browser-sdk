// Importing `@angular/router` at runtime pulls transitive providers (e.g. PlatformNavigation)
// that rely on Angular's JIT compiler when not AOT-linked. Load the compiler first so the
// partial-compiled decorators can be instantiated inside Karma.
import '@angular/compiler'
import { ENVIRONMENT_INITIALIZER } from '@angular/core'
import { EventType } from '@angular/router'
import { noop } from '@datadog/browser-core'
import { initializeAngularPlugin } from '../../../test/initializeAngularPlugin'
import { provideDatadogRouter, startAngularRouterTracking } from './provideDatadogRouter'

type EventListener = (event: unknown) => void

function createFakeRouter() {
  const listeners: EventListener[] = []
  return {
    events: {
      subscribe(next: EventListener) {
        listeners.push(next)
        return { unsubscribe: noop }
      },
    },
    emit(event: unknown) {
      for (const listener of listeners) {
        listener(event)
      }
    },
  }
}

function buildResolveStart(paths: string[], urlAfterRedirects: string) {
  const root: { routeConfig: { path: string } | null; firstChild: unknown } = {
    routeConfig: null,
    firstChild: null,
  }
  let current = root
  for (const path of paths) {
    const next = { routeConfig: { path }, firstChild: null as unknown }
    current.firstChild = next
    current = next as typeof root
  }
  return {
    type: EventType.ResolveStart,
    state: { root },
    urlAfterRedirects,
  }
}

describe('provideDatadogRouter', () => {
  it('returns a single ENVIRONMENT_INITIALIZER multi-provider', () => {
    const providers = provideDatadogRouter() as Array<{ provide: unknown; multi?: boolean; useValue?: unknown }>
    expect(providers.length).toBe(1)
    expect(providers[0].provide).toBe(ENVIRONMENT_INITIALIZER)
    expect(providers[0].multi).toBe(true)
    expect(typeof providers[0].useValue).toBe('function')
  })
})

describe('startAngularRouterTracking', () => {
  it('calls startView on ResolveStart with the computed view name', () => {
    const startViewSpy = jasmine.createSpy()
    initializeAngularPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    const router = createFakeRouter()
    startAngularRouterTracking(router)
    router.emit(buildResolveStart(['users', ':id'], '/users/42'))

    expect(startViewSpy).toHaveBeenCalledOnceWith('/users/:id')
  })

  it('ignores non-ResolveStart events', () => {
    const startViewSpy = jasmine.createSpy()
    initializeAngularPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    const router = createFakeRouter()
    startAngularRouterTracking(router)
    router.emit({ type: EventType.NavigationStart, id: 1, url: '/users/42' })
    router.emit({ type: EventType.NavigationEnd, id: 1, url: '/users/42', urlAfterRedirects: '/users/42' })

    expect(startViewSpy).not.toHaveBeenCalled()
  })

  it('tracks each navigation independently', () => {
    const startViewSpy = jasmine.createSpy()
    initializeAngularPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    const router = createFakeRouter()
    startAngularRouterTracking(router)
    router.emit(buildResolveStart([''], '/'))
    router.emit(buildResolveStart(['about'], '/about'))

    expect(startViewSpy).toHaveBeenCalledTimes(2)
    expect(startViewSpy.calls.allArgs()).toEqual([['/'], ['/about']])
  })

  it('substitutes catch-all pattern with the actual path', () => {
    const startViewSpy = jasmine.createSpy()
    initializeAngularPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    const router = createFakeRouter()
    startAngularRouterTracking(router)
    router.emit(buildResolveStart(['**'], '/unknown/page'))

    expect(startViewSpy).toHaveBeenCalledOnceWith('/unknown/page')
  })

  it('uses urlAfterRedirects for view name after a redirect', () => {
    const startViewSpy = jasmine.createSpy()
    initializeAngularPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    const router = createFakeRouter()
    startAngularRouterTracking(router)
    // Initial URL '/old', redirected to '/new' — the matched tree belongs to the redirect target.
    router.emit(buildResolveStart(['new'], '/new'))

    expect(startViewSpy).toHaveBeenCalledOnceWith('/new')
  })
})
