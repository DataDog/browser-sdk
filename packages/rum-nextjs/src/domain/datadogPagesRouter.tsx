'use client'

import { useRef } from 'react'
import { useRouter } from 'next/router'
import { startNextjsView } from './nextjsPlugin'

export function DatadogPagesRouter() {
  const router = useRouter()
  const previousPathname = useRef<string | null>(null)

  if (previousPathname.current !== router.pathname) {
    previousPathname.current = router.pathname
    // router.pathname already contains the route pattern (e.g., "/user/[id]")
    startNextjsView(router.pathname)
  }

  return null
}
