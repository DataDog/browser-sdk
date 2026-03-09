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
})
