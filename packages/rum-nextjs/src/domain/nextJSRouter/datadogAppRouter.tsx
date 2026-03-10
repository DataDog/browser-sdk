'use client'

import { useRef } from 'react'
import { usePathname, useParams } from 'next/navigation'
import { mockable } from '@datadog/browser-core'
import { startNextjsView } from '../nextjsPlugin'
import { computeViewNameFromParams } from './computeViewNameFromParams'

export function DatadogAppRouter() {
  const pathname = mockable(usePathname)()
  const params = mockable(useParams)()
  const previousPathname = mockable(useRef)<string | null>(null)

  if (previousPathname.current !== pathname) {
    previousPathname.current = pathname
    startNextjsView(computeViewNameFromParams(pathname, params))
  }

  return null
}
