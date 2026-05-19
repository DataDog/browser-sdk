import { display } from '@datadog/browser-core'
import { initializeSvelteKitPlugin } from '../../../test/initializeSvelteKitPlugin'
import { startSvelteKitRouterView, computeViewName } from './startSvelteKitView'
import type { SvelteKitAfterNavigate } from './types'

function makeNavigation(routeId: string | null): SvelteKitAfterNavigate {
  return { to: { route: { id: routeId } } }
}

describe('startSvelteKitRouterView', () => {
  it('starts a new view with the computed view name', () => {
    const startViewSpy = jasmine.createSpy()
    initializeSvelteKitPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    startSvelteKitRouterView(makeNavigation('/blog/[slug]'))

    expect(startViewSpy).toHaveBeenCalledOnceWith('/blog/[slug]')
  })

  it('warns if router: true is missing from plugin config', () => {
    const warnSpy = spyOn(display, 'warn')
    initializeSvelteKitPlugin({ configuration: {} })
    startSvelteKitRouterView(makeNavigation('/'))
    expect(warnSpy).toHaveBeenCalledOnceWith(
      '`router: true` is missing from the sveltekit plugin configuration, the view will not be tracked.'
    )
  })

  it('starts a view for the initial navigation (type "enter")', () => {
    const startViewSpy = jasmine.createSpy()
    initializeSvelteKitPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    startSvelteKitRouterView(makeNavigation('/'))

    expect(startViewSpy).toHaveBeenCalledOnceWith('/')
  })

  it('strips route group from view name', () => {
    const startViewSpy = jasmine.createSpy()
    initializeSvelteKitPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    startSvelteKitRouterView(makeNavigation('/(app)/dashboard'))

    expect(startViewSpy).toHaveBeenCalledOnceWith('/dashboard')
  })

  it('handles null route id gracefully', () => {
    const startViewSpy = jasmine.createSpy()
    initializeSvelteKitPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    startSvelteKitRouterView(makeNavigation(null))

    expect(startViewSpy).toHaveBeenCalledOnceWith('/')
  })
})

describe('computeViewName', () => {
  it('returns "/" when routeId is null', () => {
    expect(computeViewName(null)).toBe('/')
  })

  // prettier-ignore
  const cases: Array<[string, string | null, string]> = [
    // description,                           routeId,                                      expected

    // Static paths
    ['static single segment',                 '/about',                                     '/about'],
    ['static nested segments',                '/blog/posts',                                '/blog/posts'],
    ['root route',                            '/',                                          '/'],

    // Dynamic segments
    ['dynamic segment',                       '/blog/[slug]',                               '/blog/[slug]'],
    ['multiple dynamic segments',             '/[org]/[repo]/tree/[branch]/[...file]',      '/[org]/[repo]/tree/[branch]/[...file]'],
    ['optional segment',                      '/[[lang]]/home',                             '/[[lang]]/home'],

    // Rest (catch-all) segments
    ['rest segment',                          '/a/[...rest]/z',                             '/a/[...rest]/z'],
    ['rest segment at root',                  '/[...path]',                                 '/[...path]'],

    // Matcher segments
    ['matcher segment',                       '/fruits/[page=fruit]',                       '/fruits/[page=fruit]'],

    // Route groups — stripped
    ['route group',                           '/(app)/dashboard',                           '/dashboard'],
    ['route group with dynamic segment',      '/(marketing)/blog/[slug]',                   '/blog/[slug]'],
    ['multiple route groups',                 '/(app)/(admin)/settings',                    '/settings'],
    ['route group at root (no path suffix)',  '/(app)',                                     ''],

    // No stripping on non-group parentheses (none expected in practice)
    ['route without group',                   '/blog/[slug]',                               '/blog/[slug]'],
  ]

  cases.forEach(([description, routeId, expected]) => {
    it(`returns "${expected}" for ${description}`, () => {
      expect(computeViewName(routeId)).toBe(expected)
    })
  })
})
