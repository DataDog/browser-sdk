import { useRef } from 'react'
import { usePathname, useParams } from 'next/navigation'
import { useRouter } from 'next/router'
import { replaceMockable } from '@datadog/browser-core/test'
import { initializeNextjsPlugin } from '../../../test/initializeNextjsPlugin'
import { DatadogAppRouter } from './datadogAppRouter'
import { DatadogPagesRouter } from './datadogPagesRouter'

function mockRouter(partial: { isReady: boolean; asPath: string; pathname: string }): ReturnType<typeof useRouter> {
  return partial as unknown as ReturnType<typeof useRouter>
}

;[
  {
    name: 'DatadogAppRouter',
    component: DatadogAppRouter,
    setupBeforeEach: () => {
      // usePathname() returns path only — strip query/hash to match real Next.js behavior
      let asPath = ''
      let params: Record<string, string> = {}
      replaceMockable(usePathname, () => asPath.split(/[?#]/)[0])
      replaceMockable(useParams, () => params)
      return (newAsPath: string, newParams: Record<string, string> = {}) => {
        asPath = newAsPath
        params = newParams
      }
    },
  },
  {
    name: 'DatadogPagesRouter',
    component: DatadogPagesRouter,
    setupBeforeEach: () => {
      let asPath = ''
      let routePattern = ''
      replaceMockable(useRouter, () => mockRouter({ isReady: true, asPath, pathname: routePattern }))
      return (newAsPath: string, newRoutePattern: string) => {
        asPath = newAsPath
        routePattern = newRoutePattern
      }
    },
  },
].forEach(({ name, component, setupBeforeEach }) => {
  describe(name, () => {
    let ref: { current: string | null }
    let setupRoute: (asPath: string, routePattern: string, params?: Record<string, string>) => void

    beforeEach(() => {
      ref = { current: null }
      replaceMockable(useRef, () => ref)
      const setup = setupBeforeEach()
      // Normalize: AppRouter derives the view name from params, PagesRouter from the route pattern.
      // Wrap each setup so the shared tests can pass (asPath, routePattern, params) uniformly.
      if (name === 'DatadogAppRouter') {
        setupRoute = (asPath: string, _routePattern: string, params?: Record<string, string>) => {
          ;(setup as (asPath: string, params?: Record<string, string>) => void)(asPath, params)
        }
      } else {
        setupRoute = (asPath: string, routePattern: string) => {
          ;(setup as (asPath: string, routePattern: string) => void)(asPath, routePattern)
        }
      }
    })

    it('starts a view on first render', () => {
      const startViewSpy = initializeNextjsPlugin()
      setupRoute('/about', '/about')

      component()

      expect(startViewSpy).toHaveBeenCalledOnceWith({ name: '/about', url: undefined })
    })

    it('does not start a new view when re-rendered with the same path', () => {
      const startViewSpy = initializeNextjsPlugin()
      setupRoute('/about', '/about')

      component()
      component()

      expect(startViewSpy).toHaveBeenCalledTimes(1)
    })

    it('starts a new view when path changes', () => {
      const startViewSpy = initializeNextjsPlugin()
      setupRoute('/about', '/about')

      component()
      setupRoute('/contact', '/contact')
      component()

      expect(startViewSpy).toHaveBeenCalledTimes(2)
      expect(startViewSpy.calls.mostRecent().args[0]).toEqual({ name: '/contact', url: undefined })
    })

    it('uses the route pattern as the view name for dynamic routes', () => {
      const startViewSpy = initializeNextjsPlugin()
      setupRoute('/user/42', '/user/[id]', { id: '42' })

      component()

      expect(startViewSpy).toHaveBeenCalledOnceWith({ name: '/user/[id]', url: undefined })
    })

    it('starts a new view for the same route pattern with different dynamic segments', () => {
      const startViewSpy = initializeNextjsPlugin()
      setupRoute('/user/42', '/user/[id]', { id: '42' })

      component()
      startViewSpy.calls.reset()
      setupRoute('/user/43', '/user/[id]', { id: '43' })
      component()

      expect(startViewSpy).toHaveBeenCalledOnceWith({ name: '/user/[id]', url: undefined })
    })

    it('does not start a new view when only query params change', () => {
      const startViewSpy = initializeNextjsPlugin()
      setupRoute('/about', '/about')

      component()
      startViewSpy.calls.reset()
      setupRoute('/about?foo=bar', '/about')
      component()

      expect(startViewSpy).not.toHaveBeenCalled()
    })

    it('does not start a new view when only the hash changes', () => {
      const startViewSpy = initializeNextjsPlugin()
      setupRoute('/about', '/about')

      component()
      startViewSpy.calls.reset()
      setupRoute('/about#section', '/about')
      component()

      expect(startViewSpy).not.toHaveBeenCalled()
    })
  })
})

describe('DatadogPagesRouter', () => {
  let ref: { current: string | null }

  beforeEach(() => {
    ref = { current: null }
    replaceMockable(useRef, () => ref)
  })

  it('does not start a view when router is not ready', () => {
    const startViewSpy = initializeNextjsPlugin()
    replaceMockable(useRouter, () => mockRouter({ isReady: false, asPath: '/', pathname: '/' }))

    DatadogPagesRouter()

    expect(startViewSpy).not.toHaveBeenCalled()
  })
})
