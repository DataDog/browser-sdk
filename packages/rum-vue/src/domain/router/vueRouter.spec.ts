import { createMemoryHistory } from 'vue-router'
import { initializeVuePlugin } from '../../../test/initializeVuePlugin'
import { createRouter } from './vueRouter'

describe('createRouter (wrapped)', () => {
  it('calls startView on navigation', (done) => {
    const startViewSpy = jasmine.createSpy()
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
      .catch(done.fail)
  })

  it('does not call startView when navigation is blocked', (done) => {
    const startViewSpy = jasmine.createSpy()
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

    router
      .push('/')
      .then(() => {
        startViewSpy.calls.reset()
        return router.push('/protected')
      })
      .then(() => {
        expect(startViewSpy).not.toHaveBeenCalled()
        done()
      })
      .catch(done.fail)
  })
})
