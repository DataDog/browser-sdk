import { useRef, useEffect } from 'react'
import { usePathname as nextUsePathname } from 'next/navigation'
import { display } from '@datadog/browser-core'
import { onRumInit } from '../reactPlugin'

/**
 * Normalizes the pathname to use route patterns (e.g., /product/123 -> /product/:id).
 */
export function normalizeViewName(pathname: string): string {
  return pathname
    .replace(/\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?=\/|[?#]|$)/gi, '/:uuid')
    .replace(/\/\d+(?=\/|[?#]|$)/g, '/:id')
}

/**
 * Starts a new RUM view.
 */
export function startNextjsView(pathname: string) {
  onRumInit((configuration, rumPublicApi) => {
    if (!configuration.nextjs) {
      display.warn('`nextjs: true` is missing from the react plugin configuration, the view will not be tracked.')
      return
    }

    const viewName = normalizeViewName(pathname)
    rumPublicApi.startView(viewName)
  })
}

/**
 * Tracks navigation changes and starts a new RUM view for each new pathname.
 */
export function usePathnameTracker(usePathname = nextUsePathname) {
  const pathname = usePathname()
  const pathnameRef = useRef<string | null>(null)

  useEffect(() => {
    if (pathnameRef.current !== pathname) {
      pathnameRef.current = pathname
      startNextjsView(pathname)
    }
  }, [pathname])
}
