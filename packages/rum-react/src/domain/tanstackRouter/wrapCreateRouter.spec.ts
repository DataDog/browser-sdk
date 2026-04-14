import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { wrapCreateRouter } from './wrapCreateRouter'
import type { AnyTanStackCreateRouter, AnyTanStackNavigationEvent, AnyTanStackRouterInstance } from './types'

describe('wrapCreateRouter', () => {
  let startViewSpy: jasmine.Spy<(name?: string | object) => void>

  beforeEach(() => {
    startViewSpy = jasmine.createSpy()
    initializeReactPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })
  })

  it('should start a view when onLoad fires with pathChanged', () => {
    const { triggerOnLoad } = createFakeRouter([
      { fullPath: '/', pathname: '/', params: {} },
      { fullPath: '/posts/$postId', pathname: '/posts/42', params: { postId: '42' } },
    ])

    triggerOnLoad({ type: 'onLoad', pathChanged: true, toLocation: { pathname: '/posts/42' } })

    expect(startViewSpy).toHaveBeenCalledWith('/posts/$postId')
  })

  it('should not start a new view when only query params change', () => {
    const { triggerOnLoad } = createFakeRouter([{ fullPath: '/', pathname: '/', params: {} }])

    startViewSpy.calls.reset()
    triggerOnLoad({ type: 'onLoad', pathChanged: false, toLocation: { pathname: '/' } })

    expect(startViewSpy).not.toHaveBeenCalled()
  })

  it('should track the initial view via onLoad', () => {
    const { triggerOnLoad } = createFakeRouter([{ fullPath: '/', pathname: '/', params: {} }])

    triggerOnLoad({ type: 'onLoad', pathChanged: true, toLocation: { pathname: '/' } })

    expect(startViewSpy).toHaveBeenCalledWith('/')
  })

  it('should use the last match fullPath as view name', () => {
    const { triggerOnLoad } = createFakeRouter([
      { fullPath: '/', pathname: '/', params: { userId: '1' } },
      { fullPath: '/users/$userId', pathname: '/users/1', params: { userId: '1' } },
    ])

    triggerOnLoad({ type: 'onLoad', pathChanged: true, toLocation: { pathname: '/users/1' } })

    expect(startViewSpy).toHaveBeenCalledWith('/users/$userId')
  })

  it('should substitute splat routes with actual path', () => {
    const { triggerOnLoad } = createFakeRouter([
      { fullPath: '/', pathname: '/', params: { _splat: 'deep/path' } },
      { fullPath: '/files/$', pathname: '/files/deep/path', params: { _splat: 'deep/path' } },
    ])

    triggerOnLoad({ type: 'onLoad', pathChanged: true, toLocation: { pathname: '/files/deep/path' } })

    expect(startViewSpy).toHaveBeenCalledWith('/files/deep/path')
  })

  it('should return "/" for root route', () => {
    const { triggerOnLoad } = createFakeRouter([
      { fullPath: '/', pathname: '/', params: {} },
      { fullPath: '/', pathname: '/', params: {} },
    ])

    triggerOnLoad({ type: 'onLoad', pathChanged: true, toLocation: { pathname: '/' } })

    expect(startViewSpy).toHaveBeenCalledWith('/')
  })
})

function createFakeRouter(matches: AnyTanStackRouterInstance['state']['matches']) {
  let onLoadCallback: ((event: AnyTanStackNavigationEvent) => void) | undefined

  const fakeCreateRouter: AnyTanStackCreateRouter = () => ({
    state: {
      location: { pathname: matches[matches.length - 1]?.pathname || '/' },
      matches,
    },
    subscribe: (_eventType: 'onLoad', fn: (event: AnyTanStackNavigationEvent) => void) => {
      onLoadCallback = fn
      return () => {
        onLoadCallback = undefined
      }
    },
  })

  wrapCreateRouter(fakeCreateRouter)({})

  return {
    triggerOnLoad: (event: AnyTanStackNavigationEvent) => {
      onLoadCallback?.(event)
    },
  }
}
