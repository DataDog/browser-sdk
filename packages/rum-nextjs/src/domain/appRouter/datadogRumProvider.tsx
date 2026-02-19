'use client'

import React, { useRef, useEffect } from 'react'
import { usePathname, useParams } from 'next/navigation'
import { computeViewNameFromParams } from '../computeViewNameFromParams'
import { startNextjsView } from '../startNextjsView'

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
