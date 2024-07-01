import React from 'react'
import { flushSync } from 'react-dom'

import { MemoryRouter, Route, useNavigate } from 'react-router-dom'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { appendComponent } from '../../../test/appendComponent'
import { Routes } from './routesComponent'

describe('Routes component', () => {
  let startViewSpy: jasmine.Spy<(name?: string | object) => void>

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
  })

  it('starts a new view as soon as it is rendered', () => {
    appendComponent(
      <MemoryRouter initialEntries={['/foo']}>
        <Routes>
          <Route path="/foo" element={null} />
        </Routes>
      </MemoryRouter>
    )

    expect(startViewSpy).toHaveBeenCalledOnceWith('/foo')
  })

  it('renders the matching route', () => {
    const container = appendComponent(
      <MemoryRouter initialEntries={['/foo']}>
        <Routes>
          <Route path="/foo" element="foo" />
        </Routes>
      </MemoryRouter>
    )

    expect(container.innerHTML).toBe('foo')
  })

  it('does not start a new view on re-render', () => {
    let forceUpdate: () => void

    function App() {
      const [, setState] = React.useState(0)
      forceUpdate = () => setState((s) => s + 1)
      return (
        <MemoryRouter initialEntries={['/foo']}>
          <Routes>
            <Route path="/foo" element={null} />
          </Routes>
        </MemoryRouter>
      )
    }

    appendComponent(<App />)

    expect(startViewSpy).toHaveBeenCalledTimes(1)

    flushSync(() => {
      forceUpdate!()
    })

    expect(startViewSpy).toHaveBeenCalledTimes(1)
  })

  it('starts a new view on navigation', () => {
    let navigate: (path: string) => void

    function NavBar() {
      navigate = useNavigate()

      return null
    }

    appendComponent(
      <MemoryRouter initialEntries={['/foo']}>
        <NavBar />
        <Routes>
          <Route path="/foo" element={null} />
          <Route path="/bar" element={null} />
        </Routes>
      </MemoryRouter>
    )

    startViewSpy.calls.reset()
    flushSync(() => {
      navigate!('/bar')
    })

    expect(startViewSpy).toHaveBeenCalledOnceWith('/bar')
  })

  it('does not start a new view if the URL is the same', () => {
    let navigate: (path: string) => void

    function NavBar() {
      navigate = useNavigate()

      return null
    }

    appendComponent(
      <MemoryRouter initialEntries={['/foo']}>
        <NavBar />
        <Routes>
          <Route path="/foo" element={null} />
        </Routes>
      </MemoryRouter>
    )

    startViewSpy.calls.reset()
    flushSync(() => {
      navigate!('/foo')
    })

    expect(startViewSpy).not.toHaveBeenCalled()
  })

  it('does not start a new view if the path is the same but with different parameters', () => {
    let navigate: (path: string) => void

    function NavBar() {
      navigate = useNavigate()

      return null
    }

    appendComponent(
      <MemoryRouter initialEntries={['/foo']}>
        <NavBar />
        <Routes>
          <Route path="/foo" element={null} />
        </Routes>
      </MemoryRouter>
    )

    startViewSpy.calls.reset()
    flushSync(() => {
      navigate!('/foo?bar=baz')
    })

    expect(startViewSpy).not.toHaveBeenCalled()
  })

  it('does not start a new view if it does not match any route', () => {
    // Prevent react router from showing a warning in the console when a route does not match
    spyOn(console, 'warn')

    appendComponent(
      <MemoryRouter>
        <Routes>
          <Route path="/bar" element={null} />
        </Routes>
      </MemoryRouter>
    )

    expect(startViewSpy).not.toHaveBeenCalled()
  })

  it('allows passing a location object', () => {
    appendComponent(
      <MemoryRouter>
        <Routes location={{ pathname: '/foo' }}>
          <Route path="/foo" element={null} />
        </Routes>
      </MemoryRouter>
    )

    expect(startViewSpy).toHaveBeenCalledOnceWith('/foo')
  })

  it('allows passing a location string', () => {
    appendComponent(
      <MemoryRouter>
        <Routes location="/foo">
          <Route path="/foo" element={null} />
        </Routes>
      </MemoryRouter>
    )

    expect(startViewSpy).toHaveBeenCalledOnceWith('/foo')
  })
})
