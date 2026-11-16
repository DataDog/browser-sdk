'use client'

import { useEffect } from 'react'

export default function HydrationMarker() {
  useEffect(() => {
    performance.mark('root-hydration-marker')
  }, [])

  return null
}
