/**
 * Next.js App Router integration.
 *
 * @packageDocumentation
 * @example
 * ```tsx
 * // app/providers.tsx (client component)
 * 'use client'
 * import type { ReactNode } from 'react'
 * import { datadogRum } from '@datadog/browser-rum'
 * import { reactPlugin, DatadogRumProvider } from '@datadog/browser-rum-react/nextjs'
 *
 * datadogRum.init({
 *   applicationId: '<DATADOG_APPLICATION_ID>',
 *   clientToken: '<DATADOG_CLIENT_TOKEN>',
 *   site: '<DATADOG_SITE>',
 *   plugins: [reactPlugin({ nextjs: true })],
 * })
 *
 * export function RumProvider({ children }: { children: ReactNode }) {
 *   return <DatadogRumProvider>{children}</DatadogRumProvider>
 * }
 * ```
 * @example
 * ```tsx
 * // app/layout.tsx (server component)
 * import { RumProvider } from './providers'
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <RumProvider>{children}</RumProvider>
 *       </body>
 *     </html>
 *   )
 * }
 * ```
 */

// Export Next.js-specific functionality
export { DatadogRumProvider } from '../domain/nextjs'
export type { DatadogRumProviderProps } from '../domain/nextjs'

// Re-export shared functionality from main package
export { ErrorBoundary, addReactError } from '../domain/error'
export type { ErrorBoundaryProps, ErrorBoundaryFallback } from '../domain/error'
export type { ReactPluginConfiguration, ReactPlugin } from '../domain/reactPlugin'
export { reactPlugin } from '../domain/reactPlugin'
// eslint-disable-next-line camelcase
export { UNSTABLE_ReactComponentTracker } from '../domain/performance'
