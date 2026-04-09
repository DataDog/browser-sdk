import { display } from '@datadog/browser-core'
import type { AnyRoute } from '@tanstack/react-router'
import { createRouter, createRootRoute, createRoute, createMemoryHistory } from '@tanstack/react-router'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { startTanStackRouterView, computeViewName } from './startTanStackRouterView'
import type { AnyTanStackRouteMatch } from './types'

describe('startTanStackRouterView', () => {
  it('creates a new view with the computed view name', () => {
    const startViewSpy = jasmine.createSpy()
    initializeReactPlugin({
      configuration: {
        router: true,
      },
      publicApi: {
        startView: startViewSpy,
      },
    })

    startTanStackRouterView([
      { fullPath: '/', pathname: '/', params: {} },
      { fullPath: '/users/$userId', pathname: '/users/1', params: { userId: '1' } },
    ])

    expect(startViewSpy).toHaveBeenCalledOnceWith('/users/$userId')
  })

  it('displays a warning if the router integration is not enabled', () => {
    const displayWarnSpy = spyOn(display, 'warn')
    initializeReactPlugin({
      configuration: {},
    })

    startTanStackRouterView([])
    expect(displayWarnSpy).toHaveBeenCalledOnceWith(
      '`router: true` is missing from the react plugin configuration, the view will not be tracked.'
    )
  })

  describe('computeViewName', () => {
    it('returns an empty string if there is no route match', () => {
      expect(computeViewName([])).toBe('')
    })

    // prettier-ignore
    const cases = [
    // route paths,                path,           expected view name

    // Simple paths
    ['/foo',                      '/foo',         '/foo'],
    ['/foo > /',                  '/foo',         '/foo'],
    ['/foo > bar',                '/foo/bar',     '/foo/bar'],
    ['/foo > bar > $p',           '/foo/bar/1',   '/foo/bar/$p'],
    ['$p',                        '/foo',         '/$p'],
    ['/foo/$p',                   '/foo/bar',     '/foo/$p'],
    ['/foo > $p',                 '/foo/bar',     '/foo/$p'],
    ['/$a/$b',                    '/foo/bar',     '/$a/$b'],
    ['/$a > $b',                  '/foo/bar',     '/$a/$b'],

    // Splats — TanStack uses "$" for catch-all segments, substituted with actual path
    ['$',                         '/foo/1',       '/foo/1'],
    ['$',                         '/',            '/'],
    ['/foo/$',                    '/foo/1',       '/foo/1'],
    ['/foo > $',                  '/foo/1',       '/foo/1'],
    ['/foo/$p > $',               '/foo/bar/baz', '/foo/$p/baz'],
    ['/$p > $',                   '/foo/bar/1',   '/$p/bar/1'],
  ] as const

    cases.forEach(([routePaths, path, expectedViewName]) => {
      it(`returns "${expectedViewName}" for route "${path}" and config "${routePaths}"`, async () => {
        const router = buildRouter(routePaths, path)
        await router.load()

        expect(computeViewName(router.state.matches as unknown as AnyTanStackRouteMatch[])).toEqual(expectedViewName)
      })
    })

    it('keeps the splat pattern when _splat param is not available', () => {
      expect(
        computeViewName([
          { fullPath: '/', pathname: '/', params: {} },
          { fullPath: '/files/$', pathname: '/files/', params: {} },
        ])
      ).toBe('/files/$')
    })
  })
})

/**
 * Convert the routePaths representing nested route paths delimited by ' > ' to an actual
 * TanStack Router instance. Example: '/foo > bar > $p' would be turned into
 * a root route with children: /foo -> bar -> $p
 */
function buildRouter(routePaths: string, path: string) {
  const segments = routePaths.split(' > ')
  const root = createRootRoute()
  const routes: AnyRoute[] = []

  for (let i = 0; i < segments.length; i++) {
    const parent = i === 0 ? root : routes[i - 1]
    const route = createRoute({ getParentRoute: () => parent, path: segments[i] })

    routes.push(route)

    if (i > 0) {
      routes[i - 1].addChildren([route])
    }
  }

  const routeTree = root.addChildren([routes[0]])

  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    isServer: true,
  })
}
