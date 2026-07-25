import { useRef } from 'react'
import { useRouter } from 'next/router'
import { mockable } from '@datadog/browser-core'
import { startNextjsView } from '../nextjsPlugin'

/**
 * Component tracking Pages Router navigations as RUM views. Render it once, in your custom App.
 *
 * @category Main
 * @example
 * ```tsx
 * // pages/_app.tsx
 * import type { AppProps } from 'next/app'
 * import { DatadogPagesRouter } from '@datadog/browser-rum-nextjs'
 *
 * export default function MyApp({ Component, pageProps }: AppProps) {
 *   return (
 *     <>
 *       <DatadogPagesRouter />
 *       <Component {...pageProps} />
 *     </>
 *   )
 * }
 * ```
 */
export function DatadogPagesRouter() {
  const router = mockable(useRouter)()
  const previousPath = mockable(useRef)<string | null>(null)

  if (!router.isReady) {
    return null
  }

  // Extract the path portion of asPath (without query params or hash) to detect navigations.
  const path = router.asPath.split(/[?#]/)[0]

  if (previousPath.current !== path) {
    // router.pathname is the route pattern (e.g., "/user/[id]") — used as the view name
    // router.asPath is the actual URL (e.g., "/user/42") — used to detect navigations between
    // different concrete URLs of the same dynamic route (e.g., /user/42 → /user/43)
    previousPath.current = path
    startNextjsView(router.pathname)
  }

  return null
}
