'use client'

import React, { type ReactNode, useEffect, useRef } from 'react'
import { usePathname, useParams } from 'next/navigation'
import { mockable } from '@datadog/browser-core'
import { computeViewName, startNextjsView } from './viewTracking'

export interface DatadogRumProviderProps {
  /**
   * The children components to render.
   */
  children: ReactNode
}

export function DatadogRumProvider({ children }: DatadogRumProviderProps) {
  const pathname = mockable(usePathname)()
  const params = mockable(useParams)() ?? {}
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
