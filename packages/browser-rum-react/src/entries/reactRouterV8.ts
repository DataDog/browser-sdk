/**
 * React Router v8 integration.
 *
 * @packageDocumentation
 * @example
 * ```ts
 * import { RouterProvider } from 'react-router/dom'
 * import { datadogRum } from '@datadog/browser-rum'
 * import { reactPlugin } from '@datadog/browser-rum-react'
 *
 * // ⚠️ Use "createBrowserRouter" from `@datadog/browser-rum-react/react-router-v8` instead of `react-router`
 * import { createBrowserRouter } from '@datadog/browser-rum-react/react-router-v8'
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
export { createBrowserRouter, createHashRouter, createMemoryRouter, useRoutes, Routes } from './reactRouterV7'
