'use client'

let renderAttempt = 0
let suspendPromise: Promise<void> | undefined

export function DiscardedRenderProbe() {
  if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('discard-nextjs-render')) {
    return null
  }

  renderAttempt += 1

  if (renderAttempt === 1) {
    suspendPromise = new Promise((resolve) => {
      setTimeout(resolve)
    })
    throw suspendPromise
  }

  return <span data-testid="discarded-render-probe-ready" hidden />
}
