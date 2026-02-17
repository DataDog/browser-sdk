import { display } from '@datadog/browser-core'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { computeViewName, startNextjsView } from './viewTracking'

describe('computeViewName', () => {
  ;[
    { pathname: '/', params: {}, expected: '/' },
    { pathname: '/about', params: {}, expected: '/about' },
    { pathname: '/user/42', params: { id: '42' }, expected: '/user/:id' },
    {
      pathname: '/orders/456/items/789',
      params: { orderId: '456', itemId: '789' },
      expected: '/orders/:orderId/items/:itemId',
    },
    {
      pathname: '/user/abc12345-1234-1234-1234-123456789012',
      params: { id: 'abc12345-1234-1234-1234-123456789012' },
      expected: '/user/:id',
    },
    {
      pathname: '/user/abc12345-1234-1234-1234-123456789012/profile',
      params: { id: 'abc12345-1234-1234-1234-123456789012' },
      expected: '/user/:id/profile',
    },
    {
      pathname: '/docs/a/b/c',
      params: { slug: ['a', 'b', 'c'] },
      expected: '/docs/:slug',
    },
    {
      pathname: '/blog/my-awesome-post',
      params: { slug: 'my-awesome-post' },
      expected: '/blog/:slug',
    },
  ].forEach(({ pathname, params, expected }) => {
    it(`computes ${pathname} with params ${JSON.stringify(params)} to ${expected}`, () => {
      expect(computeViewName(pathname, params)).toBe(expected)
    })
  })
})

describe('startNextjsView', () => {
  let startViewSpy: jasmine.Spy<(name?: string | object) => void>

  beforeEach(() => {
    startViewSpy = jasmine.createSpy()
    initializeReactPlugin({
      configuration: {
        nextjs: true,
      },
      publicApi: {
        startView: startViewSpy,
      },
    })
  })

  it('creates a new view with the given view name', () => {
    startNextjsView('/user/:id')

    expect(startViewSpy).toHaveBeenCalledOnceWith('/user/:id')
  })

  it('warns when nextjs configuration is missing', () => {
    const localStartViewSpy = jasmine.createSpy()
    const warnSpy = spyOn(display, 'warn')
    initializeReactPlugin({
      configuration: {},
      publicApi: {
        startView: localStartViewSpy,
      },
    })

    startNextjsView('/product/:id')

    expect(warnSpy).toHaveBeenCalledOnceWith(
      '`nextjs: true` is missing from the react plugin configuration, the view will not be tracked.'
    )
    expect(localStartViewSpy).not.toHaveBeenCalled()
  })

  it('does not create a view when nextjs flag is false', () => {
    const localStartViewSpy = jasmine.createSpy()
    const warnSpy = spyOn(display, 'warn')
    initializeReactPlugin({
      configuration: {
        nextjs: false,
      },
      publicApi: {
        startView: localStartViewSpy,
      },
    })

    startNextjsView('/product/:id')

    expect(warnSpy).toHaveBeenCalled()
    expect(localStartViewSpy).not.toHaveBeenCalled()
  })
})
