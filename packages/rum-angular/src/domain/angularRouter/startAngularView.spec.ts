import { display } from '@datadog/browser-core'
import { initializeAngularPlugin } from '../../../../test/initializeAngularPlugin'
import type { AngularActivatedRouteSnapshot } from './types'
import { startAngularView, computeViewName } from './startAngularView'

/**
 * Build a pathFromRoot array from a list of route config path strings.
 * Each entry gets routeConfig, firstChild, and pathFromRoot set correctly.
 */
function buildPathFromRoot(paths: Array<string | null>): AngularActivatedRouteSnapshot[] {
  const snapshots: AngularActivatedRouteSnapshot[] = paths.map(() => ({
    routeConfig: null,
    firstChild: null,
    pathFromRoot: [],
  }))

  for (let i = 0; i < snapshots.length; i++) {
    snapshots[i].routeConfig = paths[i] !== null ? { path: paths[i]! } : null
    snapshots[i].pathFromRoot = snapshots.slice(0, i + 1)
    snapshots[i].firstChild = snapshots[i + 1] || null
  }

  return snapshots
}

describe('startAngularView', () => {
  it('starts a new view with the computed view name', () => {
    const startViewSpy = jasmine.createSpy()
    initializeAngularPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    startAngularView(buildPathFromRoot(['', 'user/:id']), '/user/1')

    expect(startViewSpy).toHaveBeenCalledOnceWith('/user/:id')
  })

  it('warns if router: true is missing from plugin config', () => {
    const warnSpy = spyOn(display, 'warn')
    initializeAngularPlugin({ configuration: {} })
    startAngularView(buildPathFromRoot(['']), '/')
    expect(warnSpy).toHaveBeenCalledOnceWith(
      '`router: true` is missing from the angular plugin configuration, the view will not be tracked.'
    )
  })
})

describe('computeViewName', () => {
  it('returns an empty string if there is no route match', () => {
    expect(computeViewName([], '/')).toBe('')
  })

  it('ignores routes without a routeConfig', () => {
    const snapshots = buildPathFromRoot([null, 'foo'])
    expect(computeViewName(snapshots, '/foo')).toBe('/foo')
  })

  it('ignores routes with empty path', () => {
    const snapshots = buildPathFromRoot(['', 'foo', '', 'bar'])
    expect(computeViewName(snapshots, '/foo/bar')).toBe('/foo/bar')
  })

  // prettier-ignore
  // Angular route paths are always relative (no leading slash). The root route has path: ''.
  // Each entry represents an ActivatedRouteSnapshot in the pathFromRoot chain.
  const cases: Array<[string, string[], string, string]> = [
    // description,                         pathFromRoot paths,                              urlPath,             expected

    // Simple static paths
    ['single static segment',               ['', 'foo'],                                    '/foo',              '/foo'],
    ['nested static segments',              ['', 'foo', 'bar'],                             '/foo/bar',          '/foo/bar'],
    ['deeply nested static',                ['', 'foo', 'bar', 'baz'],                      '/foo/bar/baz',      '/foo/bar/baz'],

    // Dynamic segments
    ['root param',                          ['', ':p'],                                     '/foo',              '/:p'],
    ['param in single segment',             ['', 'foo/:p'],                                 '/foo/bar',          '/foo/:p'],
    ['nested param',                        ['', 'foo', ':p'],                              '/foo/bar',          '/foo/:p'],
    ['nested with param',                   ['', 'foo', 'bar', ':p'],                       '/foo/bar/1',        '/foo/bar/:p'],
    ['multiple params in one segment',      ['', ':a/:b'],                                  '/foo/bar',          '/:a/:b'],
    ['nested multiple params',              ['', ':a', ':b'],                               '/foo/bar',          '/:a/:b'],
    ['multi-segment dynamic',               ['', 'user/:id', ':social-media'],              '/user/42/twitter',  '/user/:id/:social-media'],

    // Catch-all routes (Angular uses ** wildcard)
    ['catch-all at root',                   ['', '**'],                                     '/foo/1',            '/foo/1'],
    ['catch-all at root (index)',           ['', '**'],                                     '/',                 '/'],
    ['nested catch-all',                    ['', 'foo', '**'],                               '/foo/1',            '/foo/1'],
    ['deeply nested catch-all',             ['', 'foo', 'bar', '**'],                        '/foo/bar/baz',      '/foo/bar/baz'],
    ['static sibling before catch-all',     ['', 'foo', '**'],                               '/foo/bar',          '/foo/bar'],
    ['param before catch-all',              ['', 'foo/:p', '**'],                            '/foo/bar/baz',      '/foo/:p/baz'],
    ['multiple params before catch-all',    ['', 'org/:orgId', '**'],                        '/org/123/some/page', '/org/:orgId/some/page'],

    // Nested routes (parent + child)
    ['parent with child',                   ['', 'product/:id', 'info'],                    '/product/42/info',  '/product/:id/info'],
    ['parent with param child',             ['', 'product/:id', 'review/:reviewId'],        '/product/42/review/7', '/product/:id/review/:reviewId'],
  ]

  cases.forEach(([description, paths, urlPath, expected]) => {
    it(`returns "${expected}" for ${description}`, () => {
      expect(computeViewName(buildPathFromRoot(paths), urlPath)).toBe(expected)
    })
  })
})
