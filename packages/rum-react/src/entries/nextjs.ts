/**
 * Next.js App Router integration.
 *
 * @packageDocumentation
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { datadogRum } from '@datadog/browser-rum'
 * import { reactPlugin } from '@datadog/browser-rum-react'
 * import { DatadogRumProvider } from '@datadog/browser-rum-react/nextjs'
 *
 * datadogRum.init({
 *   applicationId: '<DATADOG_APPLICATION_ID>',
 *   clientToken: '<DATADOG_CLIENT_TOKEN>',
 *   plugins: [reactPlugin({ nextjs: true })],
 *   // ...
 * })
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <DatadogRumProvider>{children}</DatadogRumProvider>
 *       </body>
 *     </html>
 *   )
 * }
 * ```
 */

// Export Next.js-specific functionality
export {
  DatadogRumProvider,
  usePathnameTracker,
  // initDatadogRum,
  startNextjsView,
} from '../domain/nextjs'
export type { DatadogRumProviderProps, NextjsRumConfig } from '../domain/nextjs'

// Re-export shared functionality from main package
export { ErrorBoundary, addReactError } from '../domain/error'
export type { ErrorBoundaryProps, ErrorBoundaryFallback } from '../domain/error'
export type { ReactPluginConfiguration, ReactPlugin } from '../domain/reactPlugin'
export { reactPlugin } from '../domain/reactPlugin'
// eslint-disable-next-line camelcase
export { UNSTABLE_ReactComponentTracker } from '../domain/performance'
