import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { initializeVuePlugin } from '../../../test/initializeVuePlugin'
import { createRouter } from './vueRouter'

describe('createRouter (wrapped)', () => {
  it('calls startView on navigation', () =>
    new Promise<void>((done, reject) => {
      const startViewSpy = vi.fn()
      void initializeVuePlugin({
        configuration: { router: true },
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
          expect(startViewSpy).toHaveBeenCalledWith('/')
          return router.push('/about')
        })
        .then(() => {
          expect(startViewSpy).toHaveBeenCalledWith('/about')
          done()
        })
        .catch(reject)
    }))

  it('does not call startView when navigation is duplicated', () =>
    new Promise<void>((done, reject) => {
      const startViewSpy = vi.fn()
      void initializeVuePlugin({
        configuration: { router: true },
        publicApi: { startView: startViewSpy },
      })

      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/', component: {} }],
      })

      router
        .push('/')
        .then(() => {
          startViewSpy.mockClear()
          return router.push('/')
        })
        .then(() => {
          expect(startViewSpy).not.toHaveBeenCalled()
          done()
        })
        .catch(reject)
    }))

  it('does not call startView when only query params change', () =>
    new Promise<void>((done, reject) => {
      const startViewSpy = vi.fn()
      void initializeVuePlugin({
        configuration: { router: true },
        publicApi: { startView: startViewSpy },
      })

      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/products', component: {} }],
      })

      router
        .push('/products?page=1')
        .then(() => {
          startViewSpy.mockClear()
          return router.push('/products?page=2')
        })
        .then(() => {
          expect(startViewSpy).not.toHaveBeenCalled()
          done()
        })
        .catch(reject)
    }))

  it('calls startView on initial navigation to /', () =>
    new Promise<void>((done, reject) => {
      const startViewSpy = vi.fn()
      void initializeVuePlugin({
        configuration: { router: true },
        publicApi: { startView: startViewSpy },
      })

      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/', component: {} }],
      })

      router
        .push('/')
        .then(() => {
          expect(startViewSpy).toHaveBeenCalledExactlyOnceWith('/')
          done()
        })
        .catch(reject)
    }))

  it('substitutes catch-all pattern with the actual path', () =>
    new Promise<void>((done, reject) => {
      const startViewSpy = vi.fn()
      void initializeVuePlugin({
        configuration: { router: true },
        publicApi: { startView: startViewSpy },
      })

      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/', component: {} },
          { path: '/:pathMatch(.*)*', component: {} },
        ],
      })

      router
        .push('/unknown/page')
        .then(() => {
          expect(startViewSpy).toHaveBeenCalledWith('/unknown/page')
          done()
        })
        .catch(reject)
    }))

  it('does not call startView when navigation is blocked', () =>
    new Promise<void>((done, reject) => {
      const startViewSpy = vi.fn()
      void initializeVuePlugin({
        configuration: { router: true },
        publicApi: { startView: startViewSpy },
      })

      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/', component: {} },
          { path: '/protected', component: {} },
        ],
      })

      // Block all navigations to /protected
      router.beforeEach((to) => {
        if (to.path === '/protected') {
          return false
        }
      })

      router
        .push('/')
        .then(() => {
          startViewSpy.mockClear()
          return router.push('/protected')
        })
        .then(() => {
          expect(startViewSpy).not.toHaveBeenCalled()
          done()
        })
        .catch(reject)
    }))
})
