import React, { act } from 'react'
import { display } from '@datadog/browser-core'
import { usePathname, useParams } from 'next/navigation'
import { replaceMockable } from '../../../../core/test'
import { appendComponent } from '../../../test/appendComponent'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { DatadogRumProvider } from './datadogRumProvider'
import type { NextParams } from './types'

describe('DatadogRumProvider', () => {
  let mockPathname: string
  let mockParams: NextParams
  let startViewSpy: jasmine.Spy

  beforeEach(() => {
    mockPathname = '/'
    mockParams = {}

    replaceMockable(usePathname, (() => mockPathname) as typeof usePathname)
    replaceMockable(useParams, (() => mockParams) as typeof useParams)

    startViewSpy = jasmine.createSpy()
    initializeReactPlugin({
      configuration: { nextAppRouter: true },
      publicApi: { startView: startViewSpy },
    })
  })

  it('starts a view on initial mount', () => {
    mockPathname = '/users/123'
    mockParams = { id: '123' }

    appendComponent(<DatadogRumProvider>content</DatadogRumProvider>)

    expect(startViewSpy).toHaveBeenCalledOnceWith('/users/:id')
  })

  it('renders children without wrapper DOM elements', () => {
    const container = appendComponent(
      <DatadogRumProvider>
        <span>hello</span>
      </DatadogRumProvider>
    )

    expect(container.innerHTML).toBe('<span>hello</span>')
  })

  it('does not start a new view on re-render with same pathname', () => {
    mockPathname = '/about'

    let forceUpdate: () => void

    function App() {
      const [, setState] = React.useState(0)
      forceUpdate = () => setState((s) => s + 1)
      return <DatadogRumProvider>content</DatadogRumProvider>
    }

    appendComponent(<App />)
    expect(startViewSpy).toHaveBeenCalledTimes(1)

    act(() => {
      forceUpdate!()
    })

    expect(startViewSpy).toHaveBeenCalledTimes(1)
  })

  it('starts a new view when the view name changes', () => {
    mockPathname = '/users/123'
    mockParams = { id: '123' }

    let forceUpdate: () => void

    function App() {
      const [, setState] = React.useState(0)
      forceUpdate = () => setState((s) => s + 1)
      return <DatadogRumProvider>content</DatadogRumProvider>
    }

    appendComponent(<App />)
    startViewSpy.calls.reset()

    // Navigate to a different route pattern
    mockPathname = '/about'
    mockParams = {}

    act(() => {
      forceUpdate!()
    })

    expect(startViewSpy).toHaveBeenCalledOnceWith('/about')
  })

  it('does not start a new view when navigating to a different instance of the same route', () => {
    mockPathname = '/users/123'
    mockParams = { id: '123' }

    let forceUpdate: () => void

    function App() {
      const [, setState] = React.useState(0)
      forceUpdate = () => setState((s) => s + 1)
      return <DatadogRumProvider>content</DatadogRumProvider>
    }

    appendComponent(<App />)
    expect(startViewSpy).toHaveBeenCalledOnceWith('/users/:id')
    startViewSpy.calls.reset()

    // Navigate to a different user — same route pattern /users/:id
    mockPathname = '/users/456'
    mockParams = { id: '456' }

    act(() => {
      forceUpdate!()
    })

    expect(startViewSpy).not.toHaveBeenCalled()
  })

  it('starts a view with raw pathname for static routes', () => {
    mockPathname = '/about'
    mockParams = {}

    appendComponent(<DatadogRumProvider>content</DatadogRumProvider>)

    expect(startViewSpy).toHaveBeenCalledOnceWith('/about')
  })

  it('warns when nextAppRouter config is missing', () => {
    const displayWarnSpy = spyOn(display, 'warn')
    initializeReactPlugin({
      configuration: {},
      publicApi: { startView: startViewSpy },
    })

    mockPathname = '/about'

    appendComponent(<DatadogRumProvider>content</DatadogRumProvider>)

    expect(displayWarnSpy).toHaveBeenCalledOnceWith(jasmine.stringContaining('`nextAppRouter: true` is missing'))
  })
})
