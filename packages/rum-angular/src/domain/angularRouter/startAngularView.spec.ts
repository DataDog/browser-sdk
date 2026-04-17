import { display } from '@datadog/browser-core'
import { initializeAngularPlugin } from '../../../test/initializeAngularPlugin'
import { startAngularRouterView, computeViewName } from './startAngularView'
import type { AngularActivatedRouteSnapshot } from './types'

/**
 * Build an ActivatedRouteSnapshot-like tree from a flat list of route paths. The first entry
 * corresponds to the root's firstChild (Angular's root snapshot has no routeConfig), subsequent
 * entries nest as firstChild chains. Passing `undefined` produces a node with no routeConfig.
 */
function buildSnapshot(paths: Array<string | undefined>): AngularActivatedRouteSnapshot {
  const nodes: AngularActivatedRouteSnapshot[] = paths.map((path) => ({
    routeConfig: path === undefined ? null : { path },
    firstChild: null,
  }))
  for (let i = 0; i < nodes.length - 1; i++) {
    nodes[i].firstChild = nodes[i + 1]
  }
  const root: AngularActivatedRouteSnapshot = {
    routeConfig: null,
    firstChild: nodes[0] ?? null,
  }
  return root
}

describe('startAngularRouterView', () => {
  it('starts a new view with the computed view name', () => {
    const startViewSpy = jasmine.createSpy()
    initializeAngularPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    startAngularRouterView(buildSnapshot(['user', ':id']), '/user/1')

    expect(startViewSpy).toHaveBeenCalledOnceWith('/user/:id')
  })

  it('warns if router: true is missing from plugin config', () => {
    const warnSpy = spyOn(display, 'warn')
    initializeAngularPlugin({ configuration: {} })
    startAngularRouterView(buildSnapshot([]), '/')
    expect(warnSpy).toHaveBeenCalledOnceWith(
      '`router: true` is missing from the angular plugin configuration, the view will not be tracked.'
    )
  })
})

describe('computeViewName', () => {
  it('returns an empty string if the root is null', () => {
    expect(computeViewName(null, '/')).toBe('')
  })

  it('returns "/" if the tree has no routeConfig.path segments', () => {
    expect(computeViewName(buildSnapshot([undefined, '']), '/')).toBe('/')
  })

  it('ignores routes with an empty path (Angular componentless/group routes)', () => {
    expect(computeViewName(buildSnapshot(['foo', '', ':id']), '/foo/1')).toBe('/foo/:id')
  })

  // prettier-ignore
  // Angular's ActivatedRouteSnapshot exposes routeConfig.path which holds the literal Route
  // pattern ('', 'users', ':id', '**', etc.). Paths are concatenated with '/' separators.
  // Catch-all uses '**' (not bare '*' like React Router or '/:pathMatch(.*)*' like Vue).
  const cases: Array<[string, Array<string | undefined>, string, string]> = [
    // description,                         segments,                                      path,                  expected

    // Simple paths
    ['single static segment',               ['foo'],                                        '/foo',                '/foo'],
    ['nested static segments',              ['foo', 'bar'],                                 '/foo/bar',            '/foo/bar'],
    ['nested with param',                   ['foo', 'bar', ':p'],                           '/foo/bar/1',          '/foo/bar/:p'],
    ['root param',                          [':p'],                                         '/foo',                '/:p'],
    ['param in single segment',             ['foo/:p'],                                     '/foo/bar',            '/foo/:p'],
    ['nested param',                        ['foo', ':p'],                                  '/foo/bar',            '/foo/:p'],
    ['multiple params',                     [':a/:b'],                                      '/foo/bar',            '/:a/:b'],
    ['nested multiple params',              [':a', ':b'],                                   '/foo/bar',            '/:a/:b'],
    ['param with prefix',                   ['foo-:a'],                                     '/foo-1',              '/foo-:a'],
    ['empty root with child',               ['', 'users'],                                  '/users',              '/users'],
    ['empty root with param child',         ['', ':id'],                                    '/42',                 '/:id'],

    // Catch-all routes (Angular uses '**')
    ['catch-all at root',                   ['**'],                                         '/foo/1',              '/foo/1'],
    ['catch-all at root (index)',           ['**'],                                         '/',                   '/'],
    ['nested catch-all',                    ['foo', '**'],                                  '/foo/1',              '/foo/1'],
    ['deeply nested catch-all',             ['foo', 'bar', '**'],                           '/foo/bar/baz',        '/foo/bar/baz'],
    ['static sibling before catch-all',     ['foo', '**'],                                  '/foo/bar',            '/foo/bar'],
    ['param before catch-all',              [':p', '**'],                                   '/foo/baz',            '/:p/baz'],
    ['multiple params before catch-all',    ['org', ':orgId', '**'],                        '/org/123/some/page',  '/org/:orgId/some/page'],

    // URL variants
    ['strips query string in catch-all',    ['**'],                                         '/foo/bar?x=1',        '/foo/bar'],
    ['strips fragment in catch-all',        ['**'],                                         '/foo/bar#anchor',     '/foo/bar'],
  ]

  cases.forEach(([description, segments, path, expected]) => {
    it(`returns "${expected}" for ${description}`, () => {
      expect(computeViewName(buildSnapshot(segments), path)).toBe(expected)
    })
  })
})
