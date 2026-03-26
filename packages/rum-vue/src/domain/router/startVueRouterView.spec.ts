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

    startVueRouterView([{ path: '/' }, { path: 'user' }, { path: ':id' }] as unknown as RouteLocationMatched[])

    expect(startViewSpy).toHaveBeenCalledOnceWith('/user/:id')
  })

  it('warns if router: true is missing from plugin config', () => {
    const warnSpy = spyOn(display, 'warn')
    initializeVuePlugin({ configuration: {} })
    startVueRouterView([] as unknown as RouteLocationMatched[])
    expect(warnSpy).toHaveBeenCalledOnceWith(
      '`router: true` is missing from the vue plugin configuration, the view will not be tracked.'
    )
  })
})

describe('computeViewName', () => {
  // prettier-ignore
  const cases: Array<[string, Array<{ path: string }>, string]> = [
    // description,                       matched paths,                                                    expected
    ['empty matched array',               [],                                                               ''],
    ['simple route',                      [{ path: '/users' }],                                            '/users'],
    ['nested routes',                     [{ path: '/users' }, { path: '/users/:id' }],                   '/users/:id'],
    ['ignores records without a path',    [{ path: '/users' }, { path: '' }, { path: '/users/:id' }],     '/users/:id'],
    // Vue Router 4 catch-all routes use /:pathMatch(.*)*  (no bare * wildcard like React Router).
    // We keep the route pattern as-is — it is already a meaningful identifier that groups all
    // unmatched paths together, unlike React Router's * which needs substitution to be readable.
    ['catch-all route',                   [{ path: '/:pathMatch(.*)*' }],                                 '/:pathMatch(.*)*'],
  ]

  cases.forEach(([description, matched, expected]) => {
    it(`returns "${expected}" for ${description}`, () => {
      expect(computeViewName(matched as unknown as RouteLocationMatched[])).toBe(expected)
    })
  })
})
