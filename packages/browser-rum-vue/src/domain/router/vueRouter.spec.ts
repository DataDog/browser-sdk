import { describe, it, expect, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { initializeVuePlugin } from '../../../test/initializeVuePlugin'
import { createRouter } from './vueRouter'

describe('createRouter (wrapped)', () => {
  it('calls startView on navigation', async () => {
    const startViewSpy = vi.fn()
    initializeVuePlugin({
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

    await router.push('/')
    expect(startViewSpy).toHaveBeenCalledWith('/')
    await router.push('/about')
    expect(startViewSpy).toHaveBeenCalledWith('/about')
  })

  it('does not call startView when navigation is duplicated', async () => {
    const startViewSpy = vi.fn()
    initializeVuePlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: {} }],
    })

    await router.push('/')
    startViewSpy.mockClear()
    await router.push('/')
    expect(startViewSpy).not.toHaveBeenCalled()
  })

  it('does not call startView when only query params change', async () => {
    const startViewSpy = vi.fn()
    initializeVuePlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/products', component: {} }],
    })

    await router.push('/products?page=1')
    startViewSpy.mockClear()
    await router.push('/products?page=2')
    expect(startViewSpy).not.toHaveBeenCalled()
  })

  it('calls startView on initial navigation to /', async () => {
    const startViewSpy = vi.fn()
    initializeVuePlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: {} }],
    })

    await router.push('/')
    expect(startViewSpy).toHaveBeenCalledTimes(1)
    expect(startViewSpy).toHaveBeenCalledWith('/')
  })

  it('substitutes catch-all pattern with the actual path', async () => {
    const startViewSpy = vi.fn()
    initializeVuePlugin({
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

    await router.push('/unknown/page')
    expect(startViewSpy).toHaveBeenCalledWith('/unknown/page')
  })

  it('does not call startView when navigation is blocked', async () => {
    const startViewSpy = vi.fn()
    initializeVuePlugin({
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

    await router.push('/')
    startViewSpy.mockClear()
    await router.push('/protected')
    expect(startViewSpy).not.toHaveBeenCalled()
  })
})
