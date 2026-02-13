import { display } from '@datadog/browser-core'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { startNextjsView, normalizeViewName } from './viewTracking'

describe('normalizeViewName', () => {
  ;[
    ['/product/123', '/product/:id'],
    ['/user/abc12345-1234-1234-1234-123456789012', '/user/:uuid'],
    ['/about', '/about'],
    ['/', '/'],
    ['/orders/456/items/789', '/orders/:id/items/:id'],
    ['/user/ABC12345-1234-1234-1234-123456789012/profile', '/user/:uuid/profile'],
  ].forEach(([pathname, expected]) => {
    it(`normalizes ${pathname} to ${expected}`, () => {
      expect(normalizeViewName(pathname)).toBe(expected)
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
  ;[
    ['/product/123', '/product/:id'],
    ['/user/abc12345-1234-1234-1234-123456789012', '/user/:uuid'],
    ['/about', '/about'],
    ['/', '/'],
  ].forEach(([pathname, normalizedPathname]) => {
    it(`creates a new view with the normalized pathname ${normalizedPathname}`, () => {
      startNextjsView(pathname)

      expect(startViewSpy).toHaveBeenCalledOnceWith(normalizedPathname)
    })
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

    startNextjsView('/product/123')

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

    startNextjsView('/product/123')

    expect(warnSpy).toHaveBeenCalled()
    expect(localStartViewSpy).not.toHaveBeenCalled()
  })
})
