import { display } from '@datadog/browser-core'
import { initializeSvelteKitPlugin } from '../../../test/initializeSvelteKitPlugin'
import type { NavigationTarget } from './types'
import { startSvelteKitRouterView, computeViewName } from './startSvelteKitView'

function makeTarget(routeId: string | null, pathname: string): NavigationTarget {
  return {
    url: new URL(`http://localhost${pathname}`),
    route: { id: routeId },
    params: {},
  }
}

describe('startSvelteKitRouterView', () => {
  it('starts a new view with the computed view name', () => {
    const startViewSpy = jasmine.createSpy()
    initializeSvelteKitPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    startSvelteKitRouterView(makeTarget('/blog/[slug]', '/blog/hello'))

    expect(startViewSpy).toHaveBeenCalledOnceWith('/blog/[slug]')
  })

  it('warns if router: true is missing from plugin config', () => {
    const warnSpy = spyOn(display, 'warn')
    initializeSvelteKitPlugin({ configuration: {} })
    startSvelteKitRouterView(makeTarget('/', '/'))
    expect(warnSpy).toHaveBeenCalledOnceWith(
      '`router: true` is missing from the sveltekit plugin configuration, the view will not be tracked.'
    )
  })
})

describe('computeViewName', () => {
  it('falls back to the URL pathname when route.id is null', () => {
    expect(computeViewName(makeTarget(null, '/unknown/page'))).toBe('/unknown/page')
  })

  // prettier-ignore
  // SvelteKit's page.route.id is the filesystem-derived route pattern. computeViewName returns it
  // verbatim, preserving bracket syntax, matchers, optional/rest segments, and route groups.
  // Each case maps to a routeSyntax example from the concepts document.
  const cases: Array<[string, string, string, string]> = [
    // description,                         route.id,                                              pathname,                                       expected

    // Simple paths
    ['static path',                         '/about',                                              '/about',                                       '/about'],
    ['index route',                         '/',                                                   '/',                                            '/'],

    // Dynamic segments
    ['dynamic segment',                     '/blog/[slug]',                                        '/blog/hello-world',                            '/blog/[slug]'],
    ['multiple dynamic segments',           '/users/[userId]/posts/[postId]',                      '/users/1/posts/2',                             '/users/[userId]/posts/[postId]'],

    // Optional segments
    ['optional segment present',            '/[[lang]]/home',                                      '/en/home',                                     '/[[lang]]/home'],
    ['optional segment absent',             '/[[lang]]/home',                                      '/home',                                        '/[[lang]]/home'],

    // Rest / catch-all
    ['catch-all',                           '/[org]/[repo]/tree/[branch]/[...file]',               '/sveltejs/kit/tree/main/docs/routing.md',      '/[org]/[repo]/tree/[branch]/[...file]'],
    ['catch-all empty match',               '/a/[...rest]/z',                                      '/a/z',                                         '/a/[...rest]/z'],

    // Matchers
    ['matcher qualifier',                   '/fruits/[page=fruit]',                                '/fruits/apple',                                '/fruits/[page=fruit]'],

    // Route groups (parentheses are kept in route.id but not in URL)
    ['route group',                         '/(app)/dashboard',                                    '/dashboard',                                   '/(app)/dashboard'],

    // Nested routes — route.id is the leaf id
    ['nested route with layout',            '/settings/profile',                                   '/settings/profile',                            '/settings/profile'],

    // Hex-escaped characters
    ['hex-escaped characters',              '/smileys/[x+3a]-[x+29]',                              '/smileys/:-)',                                 '/smileys/[x+3a]-[x+29]'],
  ]

  cases.forEach(([description, routeId, pathname, expected]) => {
    it(`returns "${expected}" for ${description}`, () => {
      expect(computeViewName(makeTarget(routeId, pathname))).toBe(expected)
    })
  })
})
