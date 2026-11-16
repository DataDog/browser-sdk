'use client'

import { lazy } from 'react'

// Keep a separate chunk so E2E tests can delay this root layout sibling.
const HydrationMarker = lazy(() => import('./hydration-marker'))

export function LazyHydrationMarker() {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('delay-client-chunk')) {
    return <HydrationMarker />
  }
  return null
}
