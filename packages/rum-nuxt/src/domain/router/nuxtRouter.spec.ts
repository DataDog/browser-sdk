import { createRouter, createMemoryHistory } from 'vue-router'
import type { RouteLocationMatched } from 'vue-router'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { startTrackingNuxtViews, computeNuxtViewName } from './nuxtRouter'

function makePublicApi(startViewSpy: jasmine.Spy) {
  return { startView: startViewSpy } as unknown as RumPublicApi
}

describe('startTrackingNuxtViews', () => {
  it('tracks the initial view via afterEach when router is not yet ready', (done) => {
    const startViewSpy = jasmine.createSpy()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: {} }],
    })

    startTrackingNuxtViews(makePublicApi(startViewSpy), router)
    expect(startViewSpy).not.toHaveBeenCalled()

    router
      .push('/')
      .then(() => {
        expect(startViewSpy).toHaveBeenCalledOnceWith('/')
        done()
      })
      .catch(done.fail)
  })

  it('tracks the initial view immediately when router is already ready', (done) => {
    const startViewSpy = jasmine.createSpy()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: {} }],
    })

    router
      .push('/')
      .then(() => {
        startTrackingNuxtViews(makePublicApi(startViewSpy), router)
        expect(startViewSpy).toHaveBeenCalledOnceWith('/')
        done()
      })
      .catch(done.fail)
  })

  it('tracks subsequent navigations', (done) => {
    const startViewSpy = jasmine.createSpy()
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
        startViewSpy.calls.reset()
        return router.push('/about')
      })
      .then(() => {
        expect(startViewSpy).toHaveBeenCalledOnceWith('/about')
        done()
      })
      .catch(done.fail)
  })

  it('does not track a new view when navigation fails', (done) => {
    const startViewSpy = jasmine.createSpy()
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
        startViewSpy.calls.reset()
        return router.push('/protected')
      })
      .then(() => {
        expect(startViewSpy).not.toHaveBeenCalled()
        done()
      })
      .catch(done.fail)
  })

  it('does not track a new view when only query params change', (done) => {
    const startViewSpy = jasmine.createSpy()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/products', component: {} }],
    })

    router
      .push('/products?page=1')
      .then(() => {
        startTrackingNuxtViews(makePublicApi(startViewSpy), router)
        startViewSpy.calls.reset()
        return router.push('/products?page=2')
      })
      .then(() => {
        expect(startViewSpy).not.toHaveBeenCalled()
        done()
      })
      .catch(done.fail)
  })

  it('tracks a new view when the hash changes', (done) => {
    const startViewSpy = jasmine.createSpy()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/products', component: {} }],
    })

    router
      .push('/products?page=1')
      .then(() => {
        startTrackingNuxtViews(makePublicApi(startViewSpy), router)
        startViewSpy.calls.reset()
        return router.push('/products#details')
      })
      .then(() => {
        expect(startViewSpy).toHaveBeenCalledOnceWith('/products')
        done()
      })
      .catch(done.fail)
  })
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
