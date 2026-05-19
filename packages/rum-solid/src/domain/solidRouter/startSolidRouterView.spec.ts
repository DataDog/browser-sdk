import { display } from '@datadog/browser-core'
import { initializeSolidPlugin } from '../../../test/initializeSolidPlugin'
import { startSolidRouterView, computeViewName } from './startSolidRouterView'
import type { AnyRouteMatch } from './types'

describe('startSolidRouterView', () => {
  it('creates a new view with the computed view name', () => {
    const startViewSpy = jasmine.createSpy()
    initializeSolidPlugin({
      configuration: {
        router: true,
      },
      publicApi: {
        startView: startViewSpy,
      },
    })

    startSolidRouterView([
      { route: { path: '/' } },
      { route: { path: 'user' } },
      { route: { path: ':id' } },
    ] as AnyRouteMatch[])

    expect(startViewSpy).toHaveBeenCalledOnceWith('/user/:id')
  })

  it('displays a warning if the router integration is not enabled', () => {
    const displayWarnSpy = spyOn(display, 'warn')
    initializeSolidPlugin({
      configuration: {},
    })

    startSolidRouterView([])
    expect(displayWarnSpy).toHaveBeenCalledOnceWith(
      '`router: true` is missing from the solid plugin configuration, the view will not be tracked.'
    )
  })
})

describe('computeViewName', () => {
  it('returns an empty string if there is no route match', () => {
    expect(computeViewName([])).toBe('')
  })

  it('ignores routes without a path', () => {
    expect(
      computeViewName([
        { route: { path: '/foo' } },
        { route: { path: '' } },
        { route: { path: ':id' } },
      ] as AnyRouteMatch[])
    ).toBe('/foo/:id')
  })

  // prettier-ignore
  const cases: Array<[string, AnyRouteMatch[], string]> = [
    // description,                     route matches,                                                                         expected view name

    // static-path
    ['single static path',             [{ route: { path: '/users' } }],                                                      '/users'],
    ['nested relative static paths',   [{ route: { path: '/' } }, { route: { path: 'users' } }],                             '/users'],

    // dynamic-segments
    ['dynamic segment',                [{ route: { path: '/users/:id' } }],                                                   '/users/:id'],
    ['nested dynamic segment',         [{ route: { path: '/users' } }, { route: { path: ':id' } }],                          '/users/:id'],
    ['absolute nested override',       [{ route: { path: '/users' } }, { route: { path: '/users/:id' } }],                   '/users/:id'],

    // optional-segments (solid-router suffix: :param?)
    ['optional segment absent',        [{ route: { path: '/stories/:id?' } }],                                               '/stories/:id?'],
    ['optional segment present',       [{ route: { path: '/stories/:id?' } }],                                               '/stories/:id?'],

    // catch-all (solid-router uses named wildcards *name — keep as-is, do not substitute)
    ['named wildcard catch-all',       [{ route: { path: 'foo/*any' } }],                                                    '/foo/*any'],
    ['root-level named catch-all',     [{ route: { path: '*404' } }],                                                        '/*404'],

    // nested-routes
    ['absolute nested paths',          [{ route: { path: '/foo' } }, { route: { path: '/foo/bar' } }, { route: { path: '/foo/bar/:id' } }], '/foo/bar/:id'],
    ['relative nesting three levels',  [{ route: { path: '/foo' } }, { route: { path: 'bar' } }, { route: { path: ':p' } }], '/foo/bar/:p'],
    ['trailing slashes preserved',     [{ route: { path: '/foo/' } }, { route: { path: 'bar/' } }, { route: { path: ':id/' } }], '/foo/bar/:id/'],
  ]

  cases.forEach(([description, routeMatches, expectedViewName]) => {
    it(`returns "${expectedViewName}" for ${description}`, () => {
      expect(computeViewName(routeMatches)).toBe(expectedViewName)
    })
  })
})
