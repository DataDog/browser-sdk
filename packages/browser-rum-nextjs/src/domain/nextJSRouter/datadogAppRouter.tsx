'use client'

import { usePathname, useParams } from 'next/navigation'
import { mockable } from '@datadog/browser-core'
import { computeViewNameFromParams } from './computeViewNameFromParams'
import { useStartNextjsView } from './useStartNextjsView'

export function DatadogAppRouter() {
  const pathname = mockable(usePathname)()
  const params = mockable(useParams)()
  useStartNextjsView(pathname, computeViewNameFromParams(pathname, params))

  return null
}
