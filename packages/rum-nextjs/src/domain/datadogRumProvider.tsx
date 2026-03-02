'use client'

import React, { useEffect } from 'react'
import { usePathname, useParams } from 'next/navigation'
import { computeViewNameFromParams } from './computeViewNameFromParams'
import { startNextjsView } from './nextjsPlugin'

export function DatadogRumProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const params = useParams()

  useEffect(() => {
    startNextjsView(computeViewNameFromParams(pathname, params as Record<string, string | string[] | undefined>))
  }, [pathname])

  return <>{children}</>
}
