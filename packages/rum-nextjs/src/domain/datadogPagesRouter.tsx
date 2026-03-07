'use client'

import { useRef } from 'react'
import { useRouter } from 'next/router'
import { startNextjsView } from './nextjsPlugin'

export function DatadogPagesRouter() {
  const router = useRouter()
  const previousAsPath = useRef<string | null>(null)

  if (previousAsPath.current !== router.asPath) {
    previousAsPath.current = router.asPath
    // router.pathname is the route pattern (e.g., "/user/[id]") — used as the view name
    // router.asPath is the actual URL (e.g., "/user/42") — used to detect navigations between
    // different concrete URLs of the same dynamic route (e.g., /user/42 → /user/43)
    startNextjsView(router.pathname)
  }

  return null
}
