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
  // prettier-ignore
  const cases: Array<[string, Array<{ path: string }>, string, string]> = [
    // description,                       matched paths,                                                    path,                expected
    ['empty matched array',               [],                                                               '/',                 ''],
    ['simple route',                      [{ path: '/users' }],                                            '/users',            '/users'],
    ['nested routes',                     [{ path: '/users' }, { path: '/users/:id' }],                   '/users/1',          '/users/:id'],
    ['ignores records without a path',    [{ path: '/users' }, { path: '' }, { path: '/users/:id' }],     '/users/1',          '/users/:id'],
    // Vue Router 4 catch-all routes use /:pathMatch(.*)*  (no bare * wildcard like React Router).
    // We substitute the catch-all pattern with the actual path, aligning with how React Router
    // replaces splats — it shows which specific path was visited instead of the raw regex.
    ['catch-all route',                   [{ path: '/:pathMatch(.*)*' }],                                 '/unknown/page',     '/unknown/page'],
    ['nested catch-all route',            [{ path: '/app' }, { path: '/app/:pathMatch(.*)*' }],            '/app/not-found',    '/app/not-found'],
  ]

  cases.forEach(([description, matched, path, expected]) => {
    it(`returns "${expected}" for ${description}`, () => {
      expect(computeViewName(matched as unknown as RouteLocationMatched[], path)).toBe(expected)
    })
  })
})
