import { useRef } from 'react'
import { useRouter } from 'next/router'
import { mockable } from '@datadog/browser-core'
import { startNextjsView } from '../nextjsPlugin'

export function DatadogPagesRouter() {
  const router = mockable(useRouter)()
  const previousPath = mockable(useRef)<string | null>(null)

  if (!router.isReady) {
    return null
  }

  // Extract the path portion of asPath (without query params or hash) to detect navigations.
  const path = router.asPath.split(/[?#]/)[0]

  if (previousPath.current !== path) {
    // router.pathname is the route pattern (e.g., "/user/[id]") — used as the view name
    // router.asPath is the actual URL (e.g., "/user/42") — used to detect navigations between
    // different concrete URLs of the same dynamic route (e.g., /user/42 → /user/43)
    previousPath.current = path
    startNextjsView(router.pathname)
  }

  return null
}
