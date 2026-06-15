import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter as createMemoryRouterV7 } from 'react-router-dom'
import { createMemoryRouter as createMemoryRouterV6 } from 'react-router-dom-6'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { wrapCreateRouter } from './createRouter'
import type { AnyRouter, AnyRouterSubscriber } from './types'

describe('createRouter', () => {
  const versions = [
    { label: 'react-router v6', createMemoryRouter: wrapCreateRouter(createMemoryRouterV6) },
    { label: 'react-router v7', createMemoryRouter: wrapCreateRouter(createMemoryRouterV7) },
  ]

  for (const { label, createMemoryRouter } of versions) {
    describe(label, () => {
      let startViewSpy: ReturnType<typeof vi.fn>
      let router: ReturnType<typeof createMemoryRouter>

      beforeEach(() => {
        startViewSpy = vi.fn()
        initializeReactPlugin({
          configuration: {
            router: true,
          },
          publicApi: {
            startView: startViewSpy as never,
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

// Regression tests for https://github.com/DataDog/browser-sdk/issues/4657
describe('wrapCreateRouter — initial error forwarding', () => {
  const errorOpts = { newErrors: { '0': new Error('loader error') }, deletedFetchers: [] }
  const normalOpts = { newErrors: null, deletedFetchers: [] }
  const noop = () => undefined

  function buildFakeRouter(syncReplay?: typeof errorOpts) {
    let ourCallback: AnyRouterSubscriber | undefined
    const fakeRouter: AnyRouter = {
      state: { location: { pathname: '/foo' }, matches: [] },
      subscribe(fn) {
        if (!ourCallback) {
          ourCallback = fn
          if (syncReplay) {
            fn(fakeRouter.state, syncReplay)
          }
        }
        return noop
      },
    }
    wrapCreateRouter((_r: unknown[], _o?: unknown) => fakeRouter)([], {})
    return { fakeRouter, notify: (opts: typeof errorOpts | typeof normalOpts) => ourCallback!(fakeRouter.state, opts) }
  }

  it('forwards a synchronous buffer replay (react-router ≥7.15.1)', () => {
    const { fakeRouter } = buildFakeRouter(errorOpts)
    const spy = vi.fn<AnyRouterSubscriber>()
    fakeRouter.subscribe(spy)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(fakeRouter.state, errorOpts)
  })

  it('forwards an async newErrors notification that fires before the next subscriber attaches', () => {
    const { fakeRouter, notify } = buildFakeRouter()
    notify(errorOpts)
    const spy = vi.fn<AnyRouterSubscriber>()
    fakeRouter.subscribe(spy)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(fakeRouter.state, errorOpts)
  })

  it('does not forward when there is no error', () => {
    const { fakeRouter, notify } = buildFakeRouter()
    notify(normalOpts)
    const spy = vi.fn<AnyRouterSubscriber>()
    fakeRouter.subscribe(spy)
    expect(spy).not.toHaveBeenCalled()
  })

  it('does not replay errors that arrive after the next subscriber attached', () => {
    // No initial buffered error. RouterProvider subscribes, then a navigation
    // error fires and is broadcast to all subscribers — RouterProvider gets it
    // directly. A later resubscribe (e.g. RouterProvider's setState identity
    // changes when an inline onError prop changes) must NOT receive a stale
    // replay, otherwise onError would fire twice for the same error.
    const subscribers: AnyRouterSubscriber[] = []
    const fakeRouter: AnyRouter = {
      state: { location: { pathname: '/foo' }, matches: [] },
      subscribe(fn) {
        subscribers.push(fn)
        return noop
      },
    }
    wrapCreateRouter((_r: unknown[], _o?: unknown) => fakeRouter)([], {})

    const routerProvider = vi.fn<AnyRouterSubscriber>()
    fakeRouter.subscribe(routerProvider)

    // Broadcast as react-router would for a post-mount navigation error
    for (const sub of [...subscribers]) {
      sub(fakeRouter.state, errorOpts)
    }
    expect(routerProvider).toHaveBeenCalledTimes(1)

    const resubscribed = vi.fn<AnyRouterSubscriber>()
    fakeRouter.subscribe(resubscribed)
    expect(resubscribed).not.toHaveBeenCalled()
  })
})
