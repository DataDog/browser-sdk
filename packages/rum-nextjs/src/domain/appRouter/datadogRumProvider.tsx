'use client'

import React, { useRef, useEffect } from 'react'
import { usePathname, useParams } from 'next/navigation'
import { computeViewNameFromParams } from '../computeViewNameFromParams'
import { startNextjsView } from '../startNextjsView'

/**
 * @example
 * ```tsx
 * // app/components/datadog-rum-provider.tsx
 * 'use client'
 *
 * import { datadogRum } from '@datadog/browser-rum'
 * import { nextjsPlugin } from '@datadog/browser-rum-nextjs'
 * import { DatadogRumProvider } from '@datadog/browser-rum-nextjs/app-router'
 *
 * datadogRum.init({
 *   applicationId: '<APP_ID>',
 *   clientToken: '<CLIENT_TOKEN>',
 *   plugins: [nextjsPlugin({ router: 'app' })],
 * })
 *
 * export default DatadogRumProvider
 * ```
 *
 * ```tsx
 * // app/layout.tsx
 * import DatadogRumProvider from './components/datadog-rum-provider'
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
export function DatadogRumProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const params = useParams()
  const previousPathnameRef = useRef<string | null>(null)

  useEffect(() => {
    if (previousPathnameRef.current !== pathname) {
      previousPathnameRef.current = pathname
      const viewName = computeViewNameFromParams(pathname, params as Record<string, string | string[] | undefined>)
      startNextjsView(viewName)
    }
  }, [pathname, params])

  return <>{children}</>
}
