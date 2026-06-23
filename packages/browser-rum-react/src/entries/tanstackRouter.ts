/**
 * TanStack Router integration.
 *
 * @packageDocumentation
 * @example
 * ```ts
 * import { openobserveRum } from '@openobserve/browser-rum'
 * import { reactPlugin } from '@openobserve/browser-rum-react'
 *
 * // ⚠️ Use "createRouter" from `@openobserve/browser-rum-react/tanstack-router` instead of `@tanstack/react-router`
 * import { createRouter } from '@openobserve/browser-rum-react/tanstack-router'
 *
 * openobserveRum.init({
 *   applicationId: '<DATADOG_APPLICATION_ID>',
 *   clientToken: '<DATADOG_CLIENT_TOKEN>',
 *   plugins: [reactPlugin({ router: true })],
 *   // ...
 * })
 *
 * const router = createRouter({ routeTree })
 *
 * ReactDOM.createRoot(document.getElementById('root')).render(<RouterProvider router={router} />)
 * ```
 */
/* eslint-disable local-rules/disallow-side-effects */

import { createRouter as originalCreateRouter } from '@tanstack/react-router'
import { wrapCreateRouter } from '../domain/tanstackRouter/wrapCreateRouter'

/**
 * Use this function in place of `@tanstack/react-router` `createRouter`. Every time a route is
 * resolved, a new RUM view is created.
 *
 * @see https://tanstack.com/router/latest/docs/framework/react/guide/creating-a-router
 */
export const createRouter: typeof originalCreateRouter = wrapCreateRouter(originalCreateRouter)
