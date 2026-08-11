import React, { act } from 'react'
import { appendComponent } from '../../../../browser-rum-react/test/appendComponent'
import { initReactOldBrowsersSupport } from '../../../../browser-rum-react/test/reactOldBrowsersSupport'
import { initializeNextjsPlugin } from '../../../test/initializeNextjsPlugin'
import { useStartNextjsView } from './useStartNextjsView'

describe('useStartNextjsView', () => {
  beforeEach(() => {
    initReactOldBrowsersSupport()
  })

  it('starts a single view when React renders the component twice in Strict Mode', () => {
    const startViewSpy = jasmine.createSpy()
    initializeNextjsPlugin({ publicApi: { startView: startViewSpy } })

    function TestRouter() {
      useStartNextjsView('/user/42', '/user/[id]')
      return null
    }

    appendComponent(
      <React.StrictMode>
        <TestRouter />
      </React.StrictMode>
    )

    expect(startViewSpy).toHaveBeenCalledOnceWith({ name: '/user/[id]', url: undefined })
  })

  it('starts a view when the path changes', () => {
    const startViewSpy = jasmine.createSpy()
    initializeNextjsPlugin({ publicApi: { startView: startViewSpy } })

    let setRoute: (route: { path: string; viewName: string }) => void

    function TestRouter() {
      const [route, setCurrentRoute] = React.useState({ path: '/', viewName: '/' })
      setRoute = setCurrentRoute
      useStartNextjsView(route.path, route.viewName)
      return null
    }

    appendComponent(<TestRouter />)
    startViewSpy.calls.reset()

    act(() => {
      setRoute({ path: '/user/42', viewName: '/user/[id]' })
    })

    expect(startViewSpy).toHaveBeenCalledOnceWith({ name: '/user/[id]', url: undefined })
  })

  it('does not start a view until the router is ready', () => {
    const startViewSpy = jasmine.createSpy()
    initializeNextjsPlugin({ publicApi: { startView: startViewSpy } })

    let setPath: (path: string | null) => void

    function TestRouter() {
      const [path, setCurrentPath] = React.useState<string | null>(null)
      setPath = setCurrentPath
      useStartNextjsView(path, '/user/[id]')
      return null
    }

    appendComponent(<TestRouter />)
    expect(startViewSpy).not.toHaveBeenCalled()

    act(() => {
      setPath('/user/42')
    })

    expect(startViewSpy).toHaveBeenCalledOnceWith({ name: '/user/[id]', url: undefined })
  })
})
