import React, { useRef, type ReactNode } from 'react'
import { mockable } from '@datadog/browser-core'
import { usePathname, useParams } from 'next/navigation'
import { startNextjsView } from './startNextjsView'
import { computeNextViewName } from './computeNextViewName'

export function DatadogRumProvider({ children }: { children: ReactNode }) {
  const pathname = mockable(usePathname)()
  const params = mockable(useParams)()
  const viewNameRef = useRef<string | null>(null)

  const viewName = computeNextViewName(pathname, params ?? {})

  if (viewNameRef.current !== viewName) {
    viewNameRef.current = viewName
    startNextjsView(viewName)
  }

  return <>{children}</>
}

DatadogRumProvider.displayName = 'DatadogRumProvider'
