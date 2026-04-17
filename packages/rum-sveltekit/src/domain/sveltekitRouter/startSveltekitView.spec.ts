import { display } from '@datadog/browser-core'
import { initializeSveltekitPlugin } from '../../../test/initializeSveltekitPlugin'
import { startSveltekitRouterView, computeViewName } from './startSveltekitView'

describe('startSveltekitRouterView', () => {
  it('starts a new view with the computed view name', () => {
    const startViewSpy = jasmine.createSpy()
    initializeSveltekitPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    startSveltekitRouterView('/blog/[slug]')

    expect(startViewSpy).toHaveBeenCalledOnceWith('/blog/[slug]')
  })

  it('warns if router: true is missing from plugin config', () => {
    const warnSpy = spyOn(display, 'warn')
    initializeSveltekitPlugin({ configuration: {} })
    startSveltekitRouterView('/')
    expect(warnSpy).toHaveBeenCalledOnceWith(
      '`router: true` is missing from the sveltekit plugin configuration, the view will not be tracked.'
    )
  })
})

describe('computeViewName', () => {
  it('returns an empty string for a null route id', () => {
    expect(computeViewName(null)).toBe('')
  })

  // prettier-ignore
  const cases: Array<[string, string | null, string]> = [
    // description,                                  routeId,                         expected

    // static-path
    ['static root',                                  '/',                             '/'],
    ['static path',                                  '/about',                        '/about'],
    ['nested static segments',                       '/settings/profile',             '/settings/profile'],

    // dynamic-segments
    ['dynamic segment',                              '/blog/[slug]',                  '/blog/[slug]'],
    ['multiple dynamic segments',                    '/shop/[category]/[id]',         '/shop/[category]/[id]'],
    ['dynamic segment at root',                      '/[id]',                         '/[id]'],

    // optional-segments (double-bracket notation preserved verbatim)
    ['optional segment',                             '/[[lang]]/home',                '/[[lang]]/home'],
    ['optional segment at root',                     '/[[lang]]',                     '/[[lang]]'],

    // catch-all (spread notation preserved verbatim)
    ['catch-all segment',                            '/[...rest]',                    '/[...rest]'],
    ['catch-all with prefix',                        '/docs/[...path]',               '/docs/[...path]'],

    // parameter matchers — matcher suffix stripped, bracket name preserved
    ['parameter matcher stripped',                   '/fruits/[page=fruit]',          '/fruits/[page]'],
    ['parameter matcher integer',                    '/items/[id=integer]',           '/items/[id]'],
    ['parameter matcher mixed with plain param',     '/[lang]/[id=integer]',          '/[lang]/[id]'],
  ]

  cases.forEach(([description, routeId, expected]) => {
    it(`returns "${expected}" for ${description}`, () => {
      expect(computeViewName(routeId)).toBe(expected)
    })
  })
})
