'use client'

import { useRef } from 'react'
import { usePathname, useParams } from 'next/navigation'
import { mockable } from '@datadog/browser-core'
import { startNextjsView } from '../nextjsPlugin'
import { computeViewNameFromParams } from './computeViewNameFromParams'

/**
 * Component tracking App Router navigations as RUM views. Render it once, near the root of your
 * layout.
 *
 * @category Main
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { DatadogAppRouter } from '@datadog/browser-rum-nextjs'
 *
 * export default function RootLayout({ children }: { children: React.ReactNode }) {
 *   return (
 *     <html lang="en">
 *       <body>
 *         <DatadogAppRouter />
 *         {children}
 *       </body>
 *     </html>
 *   )
 * }
 * ```
 */
export function DatadogAppRouter() {
  const pathname = mockable(usePathname)()
  const params = mockable(useParams)()
  const previousPathname = mockable(useRef)<string | null>(null)

  if (previousPathname.current !== pathname) {
    previousPathname.current = pathname
    startNextjsView(computeViewNameFromParams(pathname, params))
  }

  return null
}
