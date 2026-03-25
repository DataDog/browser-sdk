import { display } from '@datadog/browser-core'
import type { RouteLocationMatched } from 'vue-router'
import { initializeVuePlugin } from '../../../test/initializeVuePlugin'
import { startVueRouterView, computeViewName } from './startVueRouterView'

describe('startVueRouterView', () => {
  it('starts a new view with the computed view name', () => {
    const startViewSpy = jasmine.createSpy()
    initializeVuePlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    startVueRouterView(
      [{ path: '/' }, { path: 'user' }, { path: ':id' }] as unknown as RouteLocationMatched[],
      '/user/1'
    )

    expect(startViewSpy).toHaveBeenCalledOnceWith('/user/:id')
  })

  it('warns if router: true is missing from plugin config', () => {
    const warnSpy = spyOn(display, 'warn')
    initializeVuePlugin({ configuration: {} })
    startVueRouterView([] as unknown as RouteLocationMatched[], '/')
    expect(warnSpy).toHaveBeenCalledOnceWith(
      '`router: true` is missing from the vue plugin configuration, the view will not be tracked.'
    )
  })
})

describe('computeViewName', () => {
  it('returns an empty string if there is no route match', () => {
    expect(computeViewName([] as unknown as RouteLocationMatched[], '/')).toBe('')
  })

  it('ignores routes without a path', () => {
    expect(
      computeViewName(
        [{ path: '/foo' }, { path: '' }, { path: '/foo/:id' }] as unknown as RouteLocationMatched[],
        '/foo/1'
      )
    ).toBe('/foo/:id')
  })

  // prettier-ignore
  // Vue Router normalizes all matched paths to absolute paths, so unlike React Router there are
  // no relative segments. The test structure mirrors the React Router spec for consistency.
  const cases: Array<[string, Array<{ path: string }>, string, string]> = [
    // description,                         matched paths,                                                    path,                expected

    // Simple paths
    ['single static segment',               [{ path: '/foo' }],                                              '/foo',              '/foo'],
    ['nested static segments',              [{ path: '/foo' }, { path: '/foo/bar' }],                        '/foo/bar',          '/foo/bar'],
    ['nested with param',                   [{ path: '/foo' }, { path: '/foo/bar' }, { path: '/foo/bar/:p' }], '/foo/bar/1',      '/foo/bar/:p'],
    ['root param',                          [{ path: '/:p' }],                                               '/foo',              '/:p'],
    ['param in single segment',             [{ path: '/foo/:p' }],                                           '/foo/bar',          '/foo/:p'],
    ['nested param',                        [{ path: '/foo' }, { path: '/foo/:p' }],                         '/foo/bar',          '/foo/:p'],
    ['multiple params',                     [{ path: '/:a/:b' }],                                            '/foo/bar',          '/:a/:b'],
    ['nested multiple params',              [{ path: '/:a' }, { path: '/:a/:b' }],                           '/foo/bar',          '/:a/:b'],
    ['param with prefix',                   [{ path: '/foo-:a' }],                                           '/foo-1',            '/foo-:a'],
    ['trailing slashes',                    [{ path: '/foo/' }, { path: '/foo/bar/' }, { path: '/foo/bar/:id/' }], '/foo/bar/1/',  '/foo/bar/:id/'],
    ['absolute nested override',            [{ path: '/foo' }, { path: '/foo/bar' }, { path: '/foo/bar/:id' }], '/foo/bar/1',     '/foo/bar/:id'],

    // Catch-all routes (Vue Router uses /:pathMatch(.*)* instead of bare * like React Router)
    ['catch-all at root',                   [{ path: '/:pathMatch(.*)*' }],                                  '/foo/1',            '/foo/1'],
    ['catch-all at root (index)',           [{ path: '/:pathMatch(.*)*' }],                                  '/',                 '/'],
    ['nested catch-all',                    [{ path: '/foo' }, { path: '/foo/:pathMatch(.*)*' }],             '/foo/1',            '/foo/1'],
    ['deeply nested catch-all',             [{ path: '/foo' }, { path: '/foo/bar' }, { path: '/foo/bar/:pathMatch(.*)*' }], '/foo/bar/baz', '/foo/bar/baz'],
    ['static sibling before catch-all',     [{ path: '/foo' }, { path: '/foo/:pathMatch(.*)*' }],             '/foo/bar',          '/foo/bar'],
    ['param before catch-all',              [{ path: '/foo/:p' }, { path: '/foo/:p/:pathMatch(.*)*' }],       '/foo/bar/baz',      '/foo/bar/baz'],
  ]

  cases.forEach(([description, matched, path, expected]) => {
    it(`returns "${expected}" for ${description}`, () => {
      expect(computeViewName(matched as unknown as RouteLocationMatched[], path)).toBe(expected)
    })
  })
})
