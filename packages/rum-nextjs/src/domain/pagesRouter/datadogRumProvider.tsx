'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/router'
import { startNextjsView } from '../startNextjsView'

export function DatadogRumProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    startNextjsView(router.pathname)

    const handleRouteChange = () => {
      startNextjsView(router.pathname)
    }

    router.events.on('routeChangeComplete', handleRouteChange)

    return () => {
      router.events.off('routeChangeComplete', handleRouteChange)
    }
  }, [])

  return <>{children}</>
}
