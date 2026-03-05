/**
 * Next.js App Router integration.
 *
 * @packageDocumentation
 * @example
 * ```tsx
 * // lib/datadog.ts
 * 'use client'
 * import { datadogRum } from '@datadog/browser-rum'
 * import { reactPlugin } from '@datadog/browser-rum-react'
 *
 * datadogRum.init({
 *   applicationId: '<DATADOG_APPLICATION_ID>',
 *   clientToken: '<DATADOG_CLIENT_TOKEN>',
 *   plugins: [reactPlugin({ nextAppRouter: true })],
 * })
 *
 * // app/layout.tsx
 * import { DatadogRumProvider } from '@datadog/browser-rum-react/nextjs'
 *
 * export default function RootLayout({ children }: { children: React.ReactNode }) {
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
export { DatadogRumProvider } from '../domain/nextjs'
