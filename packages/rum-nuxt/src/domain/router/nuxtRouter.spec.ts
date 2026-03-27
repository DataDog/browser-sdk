import { createRouter, createMemoryHistory } from 'vue-router'
import type { RouteLocationMatched } from 'vue-router'
import { initializeNuxtPlugin } from '../../../test/initializeNuxtPlugin'
import { startTrackingNuxtViews, computeNuxtViewName } from './nuxtRouter'

describe('startTrackingNuxtViews', () => {
  it('tracks the initial view immediately', (done) => {
    const startViewSpy = jasmine.createSpy()
    initializeNuxtPlugin({
      publicApi: { startView: startViewSpy },
    })

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: {} }],
    })

    router
      .push('/')
      .then(() => {
        startTrackingNuxtViews(router)
        expect(startViewSpy).toHaveBeenCalledOnceWith('/')
        done()
      })
      .catch(done.fail)
  })

  it('tracks subsequent navigations', (done) => {
    const startViewSpy = jasmine.createSpy()
    initializeNuxtPlugin({
      publicApi: { startView: startViewSpy },
    })

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
        startTrackingNuxtViews(router)
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
    initializeNuxtPlugin({
      publicApi: { startView: startViewSpy },
    })

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
        startTrackingNuxtViews(router)
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
    initializeNuxtPlugin({
      publicApi: { startView: startViewSpy },
    })

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/products', component: {} }],
    })

    router
      .push('/products?page=1')
      .then(() => {
        startTrackingNuxtViews(router)
        startViewSpy.calls.reset()
        return router.push('/products?page=2')
      })
      .then(() => {
        expect(startViewSpy).not.toHaveBeenCalled()
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
    ['catch-all param',                   [{ path: '/guides/:slug(.*)*' }],      '/guides/[...slug]'],
    ['pathMatch catch-all',               [{ path: '/:pathMatch(.*)*' }],        '/[...pathMatch]'],
    ['multiple segments',                 [{ path: '/a/:b/:c' }],                '/a/[b]/[c]'],
    ['static route unchanged',            [{ path: '/static/path' }],            '/static/path'],
  ]

  cases.forEach(([description, matched, expected]) => {
    it(`returns "${expected}" for ${description}`, () => {
      expect(computeNuxtViewName(matched as unknown as RouteLocationMatched[])).toBe(expected)
    })
  })
})
