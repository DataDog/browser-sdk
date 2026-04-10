import { display } from '@datadog/browser-core'
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
      it(`returns "${expectedViewName}" for route "${path}" and config "${routePaths}"`, () => {
        const router = buildRouter(routePaths, path)

        expect(computeViewName(router.state.matches)).toEqual(expectedViewName)
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
 * Build a mock router that mimics TanStack Router's resolved state for a given route config and
 * path. The routePaths string uses ' > ' to delimit nested route segments (e.g. '/foo > bar > $p').
 */
function buildRouter(routePaths: string, path: string) {
  const segments = routePaths.split(' > ')
  let fullPath = ''
  for (const segment of segments) {
    if (segment === '/') {
      fullPath += '/'
    } else if (segment.startsWith('/')) {
      fullPath += segment
    } else {
      fullPath += `/${segment}`
    }
  }

  const params: Record<string, string> = {}
  const templateParts = fullPath.split('/')
  const pathParts = path.split('/')

  let pathIdx = 0
  for (let i = 0; i < templateParts.length; i++) {
    const tpl = templateParts[i]
    if (tpl === '$') {
      params._splat = pathParts.slice(pathIdx).join('/')
      break
    } else if (tpl.startsWith('$')) {
      params[tpl.slice(1)] = pathParts[pathIdx] || ''
    }
    pathIdx++
  }

  return {
    state: {
      matches: [{ fullPath, pathname: path, params }] as AnyTanStackRouteMatch[],
    },
  }
}
