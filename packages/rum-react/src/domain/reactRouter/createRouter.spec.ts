import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { createMemoryRouter as createMemoryRouterV6 } from '../../entries/reactRouterV6'
import { createMemoryRouter as createMemoryRouterV7 } from '../../entries/reactRouterV7'

describe('createRouter', () => {
  const versions = [
    { label: 'react-router v6', createMemoryRouter: createMemoryRouterV6 },
    { label: 'react-router v7', createMemoryRouter: createMemoryRouterV7 },
  ]

  for (const { label, createMemoryRouter } of versions) {
    describe(label, () => {
      let startViewSpy: jasmine.Spy<(name?: string | object) => void>
      let router: ReturnType<typeof createMemoryRouter>

      beforeEach(() => {
        if (!window.AbortController) {
          pending('createMemoryRouter relies on AbortController')
        }

        startViewSpy = jasmine.createSpy()
        initializeReactPlugin({
          configuration: {
            router: true,
          },
          publicApi: {
            startView: startViewSpy,
          },
        })

        router = createMemoryRouter(
          [{ path: '/foo' }, { path: '/bar', children: [{ path: 'nested' }] }, { path: '*' }],
          {
            initialEntries: ['/foo'],
          }
        )
      })

      afterEach(() => {
        router?.dispose()
      })

      it('creates a new view when the router is created', () => {
        expect(startViewSpy).toHaveBeenCalledWith('/foo')
      })

      it('creates a new view when the router navigates', async () => {
        startViewSpy.calls.reset()
        await router.navigate('/bar')
        expect(startViewSpy).toHaveBeenCalledWith('/bar')
      })

      it('creates a new view when the router navigates to a nested route', async () => {
        await router.navigate('/bar')
        startViewSpy.calls.reset()
        await router.navigate('/bar/nested')
        expect(startViewSpy).toHaveBeenCalledWith('/bar/nested')
      })

      it('creates a new view with the fallback route', async () => {
        startViewSpy.calls.reset()
        await router.navigate('/non-existent')
        expect(startViewSpy).toHaveBeenCalledWith('/non-existent')
      })

      it('does not create a new view when navigating to the same URL', async () => {
        await router.navigate('/bar')
        startViewSpy.calls.reset()
        await router.navigate('/bar')
        expect(startViewSpy).not.toHaveBeenCalled()
      })

      it('does not create a new view when just changing query parameters', async () => {
        await router.navigate('/bar')
        startViewSpy.calls.reset()
        await router.navigate('/bar?baz=1')
        expect(startViewSpy).not.toHaveBeenCalled()
      })
    })
  }
})
