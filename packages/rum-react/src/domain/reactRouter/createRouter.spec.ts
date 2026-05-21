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
      let startViewSpy: jasmine.Spy<(name?: string | object) => void>
      let router: ReturnType<typeof createMemoryRouter>

      beforeEach(() => {
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
    const spy = jasmine.createSpy<AnyRouterSubscriber>()
    fakeRouter.subscribe(spy)
    expect(spy).toHaveBeenCalledOnceWith(fakeRouter.state, errorOpts)
  })

  it('forwards an async newErrors notification', () => {
    const { fakeRouter, notify } = buildFakeRouter()
    notify(errorOpts)
    const spy = jasmine.createSpy<AnyRouterSubscriber>()
    fakeRouter.subscribe(spy)
    expect(spy).toHaveBeenCalledOnceWith(fakeRouter.state, errorOpts)
  })

  it('does not forward when there is no error', () => {
    const { fakeRouter, notify } = buildFakeRouter()
    notify(normalOpts)
    const spy = jasmine.createSpy<AnyRouterSubscriber>()
    fakeRouter.subscribe(spy)
    expect(spy).not.toHaveBeenCalled()
  })

  it('forwards only once — subsequent error navigations are not replayed', () => {
    const { fakeRouter, notify } = buildFakeRouter(errorOpts)
    const firstSpy = jasmine.createSpy<AnyRouterSubscriber>()
    fakeRouter.subscribe(firstSpy)
    notify(errorOpts)
    const secondSpy = jasmine.createSpy<AnyRouterSubscriber>()
    fakeRouter.subscribe(secondSpy)
    expect(firstSpy).toHaveBeenCalledTimes(1)
    expect(secondSpy).not.toHaveBeenCalled()
  })
})
