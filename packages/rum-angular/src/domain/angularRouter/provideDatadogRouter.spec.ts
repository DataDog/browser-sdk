import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { Subject, filter } from 'rxjs'
import { registerCleanupTask } from '../../../../core/test'
import { angularPlugin, resetAngularPlugin, startAngularView } from '../angularPlugin'
import { computeRouteViewName } from './computeRouteViewName'
import type { RouteSnapshot } from './types'

/**
 * Simulate the subscription logic from provideDatadogRouter without Angular TestBed.
 *
 * provideDatadogRouter() creates an ENVIRONMENT_INITIALIZER that:
 * 1. Injects Router
 * 2. Subscribes to router.events filtered for GuardsCheckEnd
 * 3. Calls computeRouteViewName on event.state.root
 * 4. Calls startAngularView with the result
 *
 * We test this logic with a mock Router to avoid Angular DI overhead.
 */

// GuardsCheckEnd carries the destination state on event.state.root
interface MockGuardsCheckEnd {
  id: number
  url: string
  urlAfterRedirects: string
  state: { root: RouteSnapshot }
}

interface MockRouter {
  events: Subject<MockGuardsCheckEnd | { type: 'cancel' }>
}

function createMockRouter(): MockRouter {
  return {
    events: new Subject(),
  }
}

function createRoot(path: string): RouteSnapshot {
  return {
    routeConfig: null,
    outlet: 'primary',
    children: [
      {
        routeConfig: { path },
        outlet: 'primary',
        children: [],
      },
    ],
  }
}

function createGuardsCheckEnd(id: number, path: string): MockGuardsCheckEnd {
  return {
    id,
    url: `/${path}`,
    urlAfterRedirects: `/${path}`,
    state: { root: createRoot(path) },
  }
}

// Simulate provideDatadogRouter's initializer logic:
// subscribe to GuardsCheckEnd-like events, compute view name from event.state.root
function simulateInitializer(router: MockRouter): void {
  router.events.pipe(filter((event): event is MockGuardsCheckEnd => 'state' in event)).subscribe((event) => {
    const root = event.state.root
    const viewName = computeRouteViewName(root)
    startAngularView(viewName)
  })
}

const INIT_CONFIGURATION = {} as RumInitConfiguration

describe('provideDatadogRouter subscription logic', () => {
  let startViewSpy: jasmine.Spy
  let router: MockRouter

  beforeEach(() => {
    registerCleanupTask(() => {
      resetAngularPlugin()
    })

    startViewSpy = jasmine.createSpy('startView')
    const publicApi = { startView: startViewSpy } as unknown as RumPublicApi
    angularPlugin({ router: true }).onInit!({ publicApi, initConfiguration: { ...INIT_CONFIGURATION } })

    router = createMockRouter()
    simulateInitializer(router)
  })

  it('calls startAngularView with computed view name on GuardsCheckEnd', () => {
    router.events.next(createGuardsCheckEnd(1, 'home'))

    expect(startViewSpy).toHaveBeenCalledOnceWith({ name: '/home' })
  })

  it('does not call startAngularView for non-GuardsCheckEnd events', () => {
    router.events.next({ type: 'cancel' })

    expect(startViewSpy).not.toHaveBeenCalled()
  })

  it('calls startAngularView multiple times for multiple navigations', () => {
    router.events.next(createGuardsCheckEnd(1, 'home'))
    router.events.next(createGuardsCheckEnd(2, 'home'))

    expect(startViewSpy).toHaveBeenCalledTimes(2)
  })

  it('reads view name from event state on each navigation', () => {
    router.events.next(createGuardsCheckEnd(1, 'home'))
    expect(startViewSpy).toHaveBeenCalledWith({ name: '/home' })

    router.events.next(createGuardsCheckEnd(2, 'about'))
    expect(startViewSpy).toHaveBeenCalledWith({ name: '/about' })
  })
})
