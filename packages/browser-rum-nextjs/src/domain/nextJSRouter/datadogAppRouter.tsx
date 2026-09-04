'use client'

import { usePathname, useParams } from 'next/navigation'
import { mockable } from '@datadog/browser-core'
import { setNextjsViewName } from '../nextjsPlugin'
import { computeViewNameFromParams } from './computeViewNameFromParams'

export function DatadogAppRouter() {
  const pathname = mockable(usePathname)()
  const params = mockable(useParams)()
  const viewName = computeViewNameFromParams(pathname, params)

  setNextjsViewName(viewName, pathname)

  return null
}
