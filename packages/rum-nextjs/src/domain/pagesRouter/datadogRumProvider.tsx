'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/router'
import { startNextjsView } from '../startNextjsView'

/**
 * @example
 * ```tsx
 * // pages/_app.tsx
 * import type { AppProps } from 'next/app'
 * import { datadogRum } from '@datadog/browser-rum'
 * import { nextjsPlugin } from '@datadog/browser-rum-nextjs'
 * import { DatadogRumProvider } from '@datadog/browser-rum-nextjs/pages-router'
 *
 * datadogRum.init({
 *   applicationId: '<APP_ID>',
 *   clientToken: '<CLIENT_TOKEN>',
 *   plugins: [nextjsPlugin({ router: 'pages' })],
 * })
 *
 * export default function App({ Component, pageProps }: AppProps) {
 *   return (
 *     <DatadogRumProvider>
 *       <Component {...pageProps} />
 *     </DatadogRumProvider>
 *   )
 * }
 * ```
 */
export function DatadogRumProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    startNextjsView(router.pathname)

    const handleRouteChange = () => {
      startNextjsView(router.pathname)
    }

    router.events.on('routeChangeComplete', handleRouteChange)

    return () => {
      router.events.off('routeChangeComplete', handleRouteChange)
    }
  }, [])

  return <>{children}</>
}
