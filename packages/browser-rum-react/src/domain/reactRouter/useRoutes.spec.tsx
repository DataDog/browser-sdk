import React, { act } from 'react'
import * as rrdom6 from 'react-router-dom-6'
import * as rrdom7 from 'react-router-dom'
import { appendComponent } from '../../../test/appendComponent'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { initReactOldBrowsersSupport } from '../../../test/reactOldBrowsersSupport'
import { ignoreConsoleLogs } from '../../../../browser-core/test'
import { createFakeInternalApi } from '../../../../browser-rum-core/test'
import type { AnyRouteObject } from './types'
import { ignoreReactRouterDeprecationWarnings } from './reactRouter.specHelper'
import { wrapUseRoutes } from './useRoutes'

const versions = [
  {
    version: 'react-router-6',
    MemoryRouter: rrdom6.MemoryRouter,
    useNavigate: rrdom6.useNavigate,
    useRoutes: wrapUseRoutes({
      useRoutes: rrdom6.useRoutes,
      useLocation: rrdom6.useLocation,
      matchRoutes: rrdom6.matchRoutes,
    }),
  },
  {
    version: 'react-router-7',
    MemoryRouter: rrdom7.MemoryRouter,
    useNavigate: rrdom7.useNavigate,
    useRoutes: wrapUseRoutes({
      useRoutes: rrdom7.useRoutes,
      useLocation: rrdom7.useLocation,
      matchRoutes: rrdom7.matchRoutes,
    }),
  },
]

versions.forEach(({ version, MemoryRouter, useNavigate, useRoutes }) => {
  type NavigateFunction = ReturnType<typeof useNavigate>

  function RoutesRenderer({
    routes,
    location,
  }: {
    routes: AnyRouteObject[]
    location?: { pathname: string } | string
  }) {
    return useRoutes(routes, location)
  }

  describe(`useRoutes (${version})`, () => {
    let viewNames: string[]

    beforeEach(() => {
      ignoreReactRouterDeprecationWarnings()
      initReactOldBrowsersSupport()
      const fakeInternalApi = createFakeInternalApi()
      viewNames = fakeInternalApi.viewNames
      initializeReactPlugin({
        configuration: {
          router: true,
        },
        internalApi: fakeInternalApi.internalApi,
      })
    })

    it('starts a new view as soon as it is rendered', () => {
      appendComponent(
        <MemoryRouter initialEntries={['/foo']}>
          <RoutesRenderer
            routes={[
              {
                path: '/foo',
                element: null,
              },
            ]}
          />
        </MemoryRouter>
      )

      expect(viewNames).toEqual(['/foo'])
    })

    it('renders the matching route', () => {
      const container = appendComponent(
        <MemoryRouter initialEntries={['/foo']}>
          <RoutesRenderer
            routes={[
              {
                path: '/foo',
                element: 'foo',
              },
            ]}
          />
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
            <RoutesRenderer
              routes={[
                {
                  path: '/foo',
                  element: null,
                },
              ]}
            />
          </MemoryRouter>
        )
      }

      appendComponent(<App />)

      expect(viewNames.length).toBe(1)

      act(() => {
        forceUpdate!()
      })

      expect(viewNames.length).toBe(1)
    })

    it('starts a new view on navigation', async () => {
      let navigate: NavigateFunction

      function NavBar() {
        navigate = useNavigate()
        return null
      }

      appendComponent(
        <MemoryRouter initialEntries={['/foo']}>
          <NavBar />
          <RoutesRenderer
            routes={[
              { path: '/foo', element: null },
              { path: '/bar', element: null },
            ]}
          />
        </MemoryRouter>
      )

      viewNames.length = 0

      await act(async () => {
        await navigate!('/bar')
      })

      expect(viewNames).toEqual(['/bar'])
    })

    it('does not start a new view if the URL is the same', async () => {
      let navigate: NavigateFunction

      function NavBar() {
        navigate = useNavigate()
        return null
      }

      appendComponent(
        <MemoryRouter initialEntries={['/foo']}>
          <NavBar />
          <RoutesRenderer routes={[{ path: '/foo', element: null }]} />
        </MemoryRouter>
      )

      viewNames.length = 0

      await act(async () => {
        await navigate!('/foo')
      })

      expect(viewNames).toEqual([])
    })

    it('does not start a new view if the path is the same but with different parameters', async () => {
      let navigate: NavigateFunction

      function NavBar() {
        navigate = useNavigate()
        return null
      }

      appendComponent(
        <MemoryRouter initialEntries={['/foo']}>
          <NavBar />
          <RoutesRenderer routes={[{ path: '/foo', element: null }]} />
        </MemoryRouter>
      )

      viewNames.length = 0

      await act(async () => {
        await navigate!('/foo?bar=baz')
      })

      expect(viewNames).toEqual([])
    })

    it('does not start a new view if it does not match any route', () => {
      // Prevent react router from showing a warning in the console when a route does not match
      ignoreConsoleLogs('warn', 'No routes matched location')

      appendComponent(
        <MemoryRouter>
          <RoutesRenderer routes={[{ path: '/bar', element: null }]} />
        </MemoryRouter>
      )

      expect(viewNames).toEqual([])
    })

    it('allows passing a location object', () => {
      appendComponent(
        <MemoryRouter>
          <RoutesRenderer routes={[{ path: '/foo', element: null }]} location={{ pathname: '/foo' }} />
        </MemoryRouter>
      )

      expect(viewNames).toEqual(['/foo'])
    })

    it('allows passing a location string', () => {
      appendComponent(
        <MemoryRouter>
          <RoutesRenderer
            routes={[
              {
                path: '/foo',
                element: null,
              },
            ]}
            location="/foo"
          />
        </MemoryRouter>
      )

      expect(viewNames).toEqual(['/foo'])
    })
  })
})
