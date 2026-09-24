'use client'

import { useEffect } from 'react'
import { usePathname, useParams } from 'next/navigation'
import { mockable } from '@datadog/browser-core'
import { getActiveAppRouterGeneration, setNextjsViewName } from '../nextjsPlugin'
import { computeViewNameFromParams } from './computeViewNameFromParams'

export function DatadogAppRouter() {
  const pathname = mockable(usePathname)()
  const params = mockable(useParams)()
  const viewName = computeViewNameFromParams(pathname, params)
  // Captured at render time: a newer transition may start before this render's passive effect runs.
  const generation = getActiveAppRouterGeneration()

  useEffect(() => {
    setNextjsViewName(viewName, pathname, generation)
  }, [viewName, pathname, generation])

  return null
}
