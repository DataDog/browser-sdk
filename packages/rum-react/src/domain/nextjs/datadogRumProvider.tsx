'use client'

import React, { type ReactNode, useEffect } from 'react'
import { setupHistoryTracking } from './historyTracking'
import { startNextjsView } from './viewTracking'

export interface DatadogRumProviderProps {
  /**
   * The children components to render.
   */
  children: ReactNode
}

export function DatadogRumProvider({ children }: DatadogRumProviderProps) {
  useEffect(() => {
    startNextjsView(window.location.pathname)

    const stopHistoryTracking = setupHistoryTracking((pathname) => {
      startNextjsView(pathname)
    })

    return stopHistoryTracking
  }, [])

  return <>{children}</>
}
