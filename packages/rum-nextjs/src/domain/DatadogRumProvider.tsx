'use client'

import React, { useEffect } from 'react'
import { mockable } from '@datadog/browser-core'
import { usePathname as nextUsePathname, useParams as nextUseParams } from 'next/navigation'
import { computeViewNameFromParams } from './computeViewNameFromParams'
import { startNextjsView } from './nextjsPlugin'

export function DatadogRumProvider({ children }: { children: React.ReactNode }) {
  const pathname = mockable(nextUsePathname)()
  const params = mockable(nextUseParams)()

  useEffect(() => {
    startNextjsView(computeViewNameFromParams(pathname, params as Record<string, string | string[] | undefined>))
  }, [pathname])

  return <>{children}</>
}
