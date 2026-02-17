'use client'

import React, { type ReactNode, useEffect, useRef } from 'react'
import { usePathname, useParams } from 'next/navigation'
import { computeViewName, startNextjsView } from './viewTracking'

export interface DatadogRumProviderProps {
  /**
   * The children components to render.
   */
  children: ReactNode
  /**
   * Override the current pathname for testing.
   */
  pathname?: string
  /**
   * Override the current route params for testing.
   */
  params?: Record<string, string | string[]>
}

export function DatadogRumProvider({ children, pathname: pathnameProp, params: paramsProp }: DatadogRumProviderProps) {
  const hookPathname = usePathname()
  const hookParams = useParams()
  const pathname = pathnameProp ?? hookPathname
  const params = paramsProp ?? hookParams ?? {}
  const previousPathnameRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (previousPathnameRef.current === pathname) {
      return
    }
    previousPathnameRef.current = pathname

    const viewName = computeViewName(pathname, params)
    startNextjsView(viewName)
  }, [pathname, params])

  return <>{children}</>
}
