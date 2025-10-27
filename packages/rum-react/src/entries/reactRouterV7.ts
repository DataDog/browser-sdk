/**
 * React Router v7 integration.
 *
 * @packageDocumentation
 * @example
 * ```ts
 * import { RouterProvider } from 'react-router'
 * import { datadogRum } from '@datadog/browser-rum'
 * import { reactPlugin } from '@datadog/browser-rum-react'
 *
 * // ⚠️ Use "createBrowserRouter" from `@datadog/browser-rum-react/react-router-v7` instead of `react-router`
 * import { createBrowserRouter } from '@datadog/browser-rum-react/react-router-v7'
 *
 * datadogRum.init({
 *   applicationId: '<DATADOG_APPLICATION_ID>',
 *   clientToken: '<DATADOG_CLIENT_TOKEN>',
 *   plugins: [reactPlugin({ router: true })],
 *   // ...
 * })
 *
 * const router = createBrowserRouter([
 *   {
 *     path: '/',
 *     element: <Root />,
 *     // ...
 *   },
 * ])
 *
 * ReactDOM.createRoot(document.getElementById('root')).render(<RouterProvider router={router} />)
 * ```
 */
/* eslint-disable local-rules/disallow-side-effects */

import {
  createBrowserRouter as originalCreateBrowserRouter,
  createHashRouter as originalCreateHashRouter,
  createMemoryRouter as originalCreateMemoryRouter,
  useRoutes as originalUseRoutes,
  useLocation,
  matchRoutes,
  createRoutesFromChildren,
} from 'react-router'
import type { Routes as originalRoutes } from 'react-router'
import { wrapCreateRouter, createRoutesComponent, wrapUseRoutes } from '../domain/reactRouter'

/**
 * Use this function in place of `react-router-dom` `createBrowserRouter`. Every time a route is
 * rendered, a new RUM view is created.
 *
 * @see https://reactrouter.com/v7/api/data-routers/createBrowserRouter
 */
export const createBrowserRouter: typeof originalCreateBrowserRouter = wrapCreateRouter(originalCreateBrowserRouter)

/**
 * Use this function in place of `react-router-dom` `createHashRouter`. Every time a route is
 * rendered, a new RUM view is created.
 *
 * @see https://reactrouter.com/v7/api/data-routers/createHashRouter
 */
export const createHashRouter: typeof originalCreateHashRouter = wrapCreateRouter(originalCreateHashRouter)

/**
 * Use this function in place of `react-router-dom` `createMemoryRouter`. Every time a route is
 * rendered, a new RUM view is created.
 *
 * @see https://reactrouter.com/v7/api/data-routers/createMemoryRouter
 */
export const createMemoryRouter: typeof originalCreateMemoryRouter = wrapCreateRouter(originalCreateMemoryRouter)

/**
 * Use this hook in place of `react-router-dom` `useRoutes`. Every time a route is rendered, a new
 * RUM view is created.
 *
 * @see https://reactrouter.com/v7/api/hooks/useRoutes
 */
export const useRoutes: typeof originalUseRoutes = wrapUseRoutes({
  useRoutes: originalUseRoutes,
  useLocation,
  matchRoutes,
})

/**
 * Use this component in place of `react-router-dom` `Routes`. Every time a route is rendered, a new
 * RUM view is created.
 *
 * @see https://reactrouter.com/v7/api/components/Routes
 */
export const Routes: typeof originalRoutes = createRoutesComponent(useRoutes, createRoutesFromChildren)
