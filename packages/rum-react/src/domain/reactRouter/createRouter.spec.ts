import { vi, afterEach, beforeEach, describe, expect, it, type Mock } from 'vitest'
import { createMemoryRouter as createMemoryRouterV7 } from 'react-router-dom'
import { createMemoryRouter as createMemoryRouterV6 } from 'react-router-dom-6'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { wrapCreateRouter } from './createRouter'

describe('createRouter', () => {
  const versions = [
    { label: 'react-router v6', createMemoryRouter: wrapCreateRouter(createMemoryRouterV6) },
    { label: 'react-router v7', createMemoryRouter: wrapCreateRouter(createMemoryRouterV7) },
  ]

  for (const { label, createMemoryRouter } of versions) {
    describe(label, () => {
      let startViewSpy: Mock<(name?: string | object) => void>
      let router: ReturnType<typeof createMemoryRouter>

      beforeEach((ctx) => {
        if (!window.AbortController) {
          ctx.skip()
          return
        }

        startViewSpy = vi.fn()
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
        startViewSpy.mockClear()
        await router.navigate('/bar')
        expect(startViewSpy).toHaveBeenCalledWith('/bar')
      })

      it('creates a new view when the router navigates to a nested route', async () => {
        await router.navigate('/bar')
        startViewSpy.mockClear()
        await router.navigate('/bar/nested')
        expect(startViewSpy).toHaveBeenCalledWith('/bar/nested')
      })

      it('creates a new view with the fallback route', async () => {
        startViewSpy.mockClear()
        await router.navigate('/non-existent')
        expect(startViewSpy).toHaveBeenCalledWith('/non-existent')
      })

      it('does not create a new view when navigating to the same URL', async () => {
        await router.navigate('/bar')
        startViewSpy.mockClear()
        await router.navigate('/bar')
        expect(startViewSpy).not.toHaveBeenCalled()
      })

      it('does not create a new view when just changing query parameters', async () => {
        await router.navigate('/bar')
        startViewSpy.mockClear()
        await router.navigate('/bar?baz=1')
        expect(startViewSpy).not.toHaveBeenCalled()
      })
    })
  }
})
