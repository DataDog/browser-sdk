'use client'

import { useEffect } from 'react'
import { usePathname, useParams } from 'next/navigation'
import { mockable } from '@datadog/browser-core'
import { setNextjsViewName } from '../nextjsPlugin'
import { computeViewNameFromParams } from './computeViewNameFromParams'

export function DatadogAppRouter() {
  const pathname = mockable(usePathname)()
  const params = mockable(useParams)()
  const viewName = computeViewNameFromParams(pathname, params)

  useEffect(() => {
    // usePathname() strips basePath, but activeAppRouterPathname (set from window.location.pathname
    // elsewhere in the plugin) does not — use the raw pathname here so the identity used to detect a
    // stale commit is consistent with the rest of the plugin. The (possibly basePath-free) `pathname`
    // is still used above to compute the normalized view name.
    setNextjsViewName(viewName, window.location.pathname)
  }, [viewName, pathname])

  return null
}
