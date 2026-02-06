import React, { act, useState } from 'react'
import { display } from '@datadog/browser-core'
import { appendComponent } from '../../../test/appendComponent'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { startNextjsView, usePathnameTracker } from './viewTracking'

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

describe('usePathnameTracker', () => {
  let startViewSpy: jasmine.Spy<(name?: string | object) => void>
  let usePathnameSpy: jasmine.Spy<() => string>

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

    usePathnameSpy = jasmine.createSpy('usePathname').and.returnValue('/')
  })

  function TestComponent() {
    usePathnameTracker(usePathnameSpy)
    return null
  }

  it('calls startNextjsView on mount', () => {
    usePathnameSpy.and.returnValue('/product/123')

    appendComponent(<TestComponent />)

    expect(startViewSpy).toHaveBeenCalledOnceWith('/product/:id')
  })

  it('does not create duplicate views on re-render with same pathname', () => {
    usePathnameSpy.and.returnValue('/product/123')

    function ReRenderingComponent() {
      const [, setCounter] = useState(0)
      usePathnameTracker(usePathnameSpy)

      return <button onClick={() => setCounter((c) => c + 1)}>Re-render</button>
    }

    const container = appendComponent(<ReRenderingComponent />)
    expect(startViewSpy).toHaveBeenCalledTimes(1)

    const button = container.querySelector('button') as HTMLButtonElement
    act(() => {
      button.click()
    })

    expect(startViewSpy).toHaveBeenCalledTimes(1)
  })
})
