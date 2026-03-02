'use client'

import React, { useRef } from 'react'
import { usePathname, useParams } from 'next/navigation'
import { computeViewNameFromParams } from './computeViewNameFromParams'
import { startNextjsView } from './nextjsPlugin'

export function DatadogRumProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const params = useParams()
  const previousPathname = useRef<string | null>(null)

  if (previousPathname.current !== pathname) {
    previousPathname.current = pathname
    startNextjsView(computeViewNameFromParams(pathname, params))
  }

  return <>{children}</>
}
