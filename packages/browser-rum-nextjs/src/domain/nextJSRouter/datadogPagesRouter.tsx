import { useRouter } from 'next/router'
import { mockable } from '@datadog/browser-core'
import { useStartNextjsView } from './useStartNextjsView'

export function DatadogPagesRouter() {
  const router = mockable(useRouter)()

  // Extract the path portion of asPath (without query params or hash) to detect navigations.
  const path = router.isReady ? router.asPath.split(/[?#]/)[0] : null

  // router.pathname is the route pattern (e.g., "/user/[id]") — used as the view name
  // router.asPath is the actual URL (e.g., "/user/42") — used to detect navigations between
  // different concrete URLs of the same dynamic route (e.g., /user/42 → /user/43)
  useStartNextjsView(path, router.pathname)

  return null
}
