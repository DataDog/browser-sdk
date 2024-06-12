import { createMemoryRouter } from 'react-router-dom'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { registerRouter } from './registerRouter'

describe('registerRouter', () => {
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

    router = createMemoryRouter([{ path: '/foo' }, { path: '/bar', children: [{ path: 'nested' }] }, { path: '*' }], {
      initialEntries: ['/foo'],
    })
    registerRouter(router)
  })

  afterEach(() => {
    router.dispose()
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
    expect(startViewSpy).toHaveBeenCalledWith('/*')
  })

  it('does not create a new view when the router navigates to the same URL', async () => {
    await router.navigate('/bar')
    startViewSpy.calls.reset()
    await router.navigate('/bar')
    expect(startViewSpy).not.toHaveBeenCalled()
  })

  it('does not create a new view when the router navigates to the same path but different parameters', async () => {
    await router.navigate('/bar')
    startViewSpy.calls.reset()
    await router.navigate('/bar?baz=1')
    expect(startViewSpy).not.toHaveBeenCalled()
  })
})
