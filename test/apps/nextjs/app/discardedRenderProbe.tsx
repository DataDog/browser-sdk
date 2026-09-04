'use client'

import { useEffect, useState } from 'react'

let renderAttempt = 0
let suspendPromise: Promise<void> | undefined

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
  console.log(`[DiscardedRenderProbe] render attempt #${renderAttempt}`)

  if (renderAttempt === 1) {
    console.log('[DiscardedRenderProbe] suspending render attempt #1')
    suspendPromise = new Promise((resolve) => {
      setTimeout(resolve)
    })
    throw suspendPromise
  }

  return <span data-testid="discarded-render-probe-ready" hidden />
}
