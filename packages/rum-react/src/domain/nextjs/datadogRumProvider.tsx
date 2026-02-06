'use client'

import React, { type ReactNode } from 'react'
import { usePathname as nextUsePathname } from 'next/navigation'
import { usePathnameTracker } from './viewTracking'

export interface DatadogRumProviderProps {
  /**
   * The children components to render.
   */

  children: ReactNode

  /**
   * @internal - For dependency injection in tests.
   */
  usePathname?: () => string
}

/**
 * Provider component for Next.js App Router that automatically tracks navigation.
 * Wrap your application with this component to enable automatic view tracking.
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { DatadogRumProvider } from '@datadog/browser-rum-react/nextjs'
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
export function DatadogRumProvider({ children, usePathname = nextUsePathname }: DatadogRumProviderProps) {
  usePathnameTracker(usePathname)
  return <>{children}</>
}
