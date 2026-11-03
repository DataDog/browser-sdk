'use client'

import { usePathname, useParams } from 'next/navigation'
import { mockable } from '@datadog/js-core/util'
import { startAppRouterView } from '../nextjsPlugin'
import { computeViewNameFromParams } from './computeViewNameFromParams'

export function DatadogAppRouter() {
  const pathname = mockable(usePathname)()
  const params = mockable(useParams)()

  startAppRouterView(pathname, computeViewNameFromParams(pathname, params))

  return null
}
