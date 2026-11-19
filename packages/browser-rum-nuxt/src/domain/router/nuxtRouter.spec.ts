import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { RouteLocationMatched } from 'vue-router'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { startTrackingNuxtViews, computeNuxtViewName } from './nuxtRouter'

function makePublicApi(startViewSpy: Mock) {
  return { startView: startViewSpy } as unknown as RumPublicApi
}

describe('startTrackingNuxtViews', () => {
  it('tracks the initial view via afterEach when router is not yet ready', () =>
    new Promise<void>((done, reject) => {
      const startViewSpy = vi.fn()
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/', component: {} }],
      })

      startTrackingNuxtViews(makePublicApi(startViewSpy), router)
      expect(startViewSpy).not.toHaveBeenCalled()

      router
        .push('/')
        .then(() => {
          expect(startViewSpy).toHaveBeenCalledExactlyOnceWith('/')
          done()
        })
        .catch(reject)
    }))

  it('tracks the initial view immediately when router is already ready', () =>
    new Promise<void>((done, reject) => {
      const startViewSpy = vi.fn()
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/', component: {} }],
      })

      router
        .push('/')
        .then(() => {
          startTrackingNuxtViews(makePublicApi(startViewSpy), router)
          expect(startViewSpy).toHaveBeenCalledExactlyOnceWith('/')
          done()
        })
        .catch(reject)
    }))

  it('tracks subsequent navigations', () =>
    new Promise<void>((done, reject) => {
      const startViewSpy = vi.fn()
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/', component: {} },
          { path: '/about', component: {} },
        ],
      })

      router
        .push('/')
        .then(() => {
          startTrackingNuxtViews(makePublicApi(startViewSpy), router)
          startViewSpy.mockClear()
          return router.push('/about')
        })
        .then(() => {
          expect(startViewSpy).toHaveBeenCalledExactlyOnceWith('/about')
          done()
        })
        .catch(reject)
    }))

  it('does not track a new view when navigation fails', () =>
    new Promise<void>((done, reject) => {
      const startViewSpy = vi.fn()
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/', component: {} },
          { path: '/protected', component: {} },
        ],
      })

      router.beforeEach((to) => {
        if (to.path === '/protected') {
          return false
        }
      })

      router
        .push('/')
        .then(() => {
          startTrackingNuxtViews(makePublicApi(startViewSpy), router)
          startViewSpy.mockClear()
          return router.push('/protected')
        })
        .then(() => {
          expect(startViewSpy).not.toHaveBeenCalled()
          done()
        })
        .catch(reject)
    }))

  it('does not track a new view when only query params change', () =>
    new Promise<void>((done, reject) => {
      const startViewSpy = vi.fn()
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/products', component: {} }],
      })

      router
        .push('/products?page=1')
        .then(() => {
          startTrackingNuxtViews(makePublicApi(startViewSpy), router)
          startViewSpy.mockClear()
          return router.push('/products?page=2')
        })
        .then(() => {
          expect(startViewSpy).not.toHaveBeenCalled()
          done()
        })
        .catch(reject)
    }))

  it('tracks a new view when the hash changes', () =>
    new Promise<void>((done, reject) => {
      const startViewSpy = vi.fn()
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/products', component: {} }],
      })

      router
        .push('/products?page=1')
        .then(() => {
          startTrackingNuxtViews(makePublicApi(startViewSpy), router)
          startViewSpy.mockClear()
          return router.push('/products#details')
        })
        .then(() => {
          expect(startViewSpy).toHaveBeenCalledExactlyOnceWith('/products')
          done()
        })
        .catch(reject)
    }))
})

describe('computeNuxtViewName', () => {
  // prettier-ignore
  const cases: Array<[string, Array<{ path: string }>, string]> = [
    // description,                       matched paths,                          expected
    ['empty matched array',               [],                                     ''],
    ['static route',                      [{ path: '/about' }],                  '/about'],
    ['dynamic param',                     [{ path: '/user/:id' }],               '/user/[id]'],
    ['dynamic param with empty constraint',[{ path: '/user/:id()' }],            '/user/[id]'],
    ['optional param',                    [{ path: '/:slug?' }],                 '/[[slug]]'],
    ['optional nested param',             [{ path: '/blog/:slug?' }],            '/blog/[[slug]]'],
    ['catch-all param',                   [{ path: '/guides/:slug(.*)*' }],      '/guides/[...slug]'],
    ['nested catch-all param',            [{ path: '/docs/:slug([^/]*)*/edit' }], '/docs/[...slug]/edit'],
    ['pathMatch catch-all',               [{ path: '/:pathMatch(.*)*' }],        '/[...pathMatch]'],
    ['multiple segments',                 [{ path: '/a/:b/:c' }],                '/a/[b]/[c]'],
    ['mixed static and dynamic segment',  [{ path: '/users-:group()' }],         '/users-[group]'],
    ['mixed static and optional segment', [{ path: '/users-:group?' }],          '/users-[[group]]'],
    ['multiple mixed params in one segment', [{ path: '/users-:group()-:id()' }], '/users-[group]-[id]'],
    ['mixed static and dynamic directories', [{ path: '/users-:group()/:id()' }], '/users-[group]/[id]'],
    ['static route unchanged',            [{ path: '/static/path' }],            '/static/path'],
  ]

  cases.forEach(([description, matched, expected]) => {
    it(`returns "${expected}" for ${description}`, () => {
      expect(computeNuxtViewName(matched as unknown as RouteLocationMatched[])).toBe(expected)
    })
  })
})
