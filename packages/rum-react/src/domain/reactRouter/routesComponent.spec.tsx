import React, { act } from 'react'
import * as rrdom6 from 'react-router-dom-6'
import * as rrdom7 from 'react-router-dom'
import { ignoreConsoleLogs } from '../../../../core/test'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { appendComponent } from '../../../test/appendComponent'
import { createRoutesComponent } from './routesComponent'
import { ignoreReactRouterDeprecationWarnings } from './reactRouter.specHelper'
import { wrapUseRoutes } from './useRoutes'
;[
  {
    version: 'react-router-6',
    MemoryRouter: rrdom6.MemoryRouter,
    Route: rrdom6.Route,
    useNavigate: rrdom6.useNavigate,
    Routes: createRoutesComponent(
      wrapUseRoutes({
        useRoutes: rrdom6.useRoutes,
        useLocation: rrdom6.useLocation,
        matchRoutes: rrdom6.matchRoutes,
      }),
      rrdom6.createRoutesFromChildren
    ),
  },
  {
    version: 'react-router-7',
    MemoryRouter: rrdom7.MemoryRouter,
    Route: rrdom7.Route,
    useNavigate: rrdom7.useNavigate,
    Routes: createRoutesComponent(
      wrapUseRoutes({
        useRoutes: rrdom7.useRoutes,
        useLocation: rrdom7.useLocation,
        matchRoutes: rrdom7.matchRoutes,
      }),
      rrdom7.createRoutesFromChildren
    ),
  },
].forEach(({ version, MemoryRouter, Route, useNavigate, Routes }) => {
  describe(`Routes component (${version})`, () => {
    let startViewSpy: jasmine.Spy<(name?: string | object) => void>

    beforeEach(() => {
      ignoreReactRouterDeprecationWarnings()
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

      act(() => {
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
      act(() => {
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
      act(() => {
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
      act(() => {
        navigate!('/foo?bar=baz')
      })

      expect(startViewSpy).not.toHaveBeenCalled()
    })

    it('does not start a new view if it does not match any route', () => {
      // Prevent react router from showing a warning in the console when a route does not match
      ignoreConsoleLogs('warn', 'No routes matched location')

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
})
