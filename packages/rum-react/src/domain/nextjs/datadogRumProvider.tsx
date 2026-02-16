'use client'

import React, { type ReactNode, useEffect, useRef } from 'react'
import { setupHistoryTracking } from './historyTracking'
import { startNextjsView } from './viewTracking'

export interface DatadogRumProviderProps {
  /**
   * The children components to render.
   */
  children: ReactNode
}

export function DatadogRumProvider({ children }: DatadogRumProviderProps) {
  // This ref is needed because of React <StrictMode>.
  const isSetupRef = useRef(false)

  useEffect(() => {
    if (isSetupRef.current) {
      return
    }
    isSetupRef.current = true

    startNextjsView(window.location.pathname)

    setupHistoryTracking((pathname) => {
      startNextjsView(pathname)
    })
  }, [])

  return <>{children}</>
}
