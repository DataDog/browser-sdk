'use client'

import { useEffect, useState } from 'react'

let renderAttempt = 0

export function DiscardedRenderProbe() {
  const enabled =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('discard-nextjs-render')
  const [started, setStarted] = useState(false)

  useEffect(() => {
    if (enabled) {
      setStarted(true)
    }
  }, [enabled])

  if (!started) {
    return null
  }

  renderAttempt += 1

  if (renderAttempt === 1) {
    throw new Promise<void>((resolve) => setTimeout(resolve))
  }

  return <span data-testid="discarded-render-probe-ready" hidden />
}
