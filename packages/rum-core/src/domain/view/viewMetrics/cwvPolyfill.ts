import type { Duration } from '@datadog/browser-core'

export function measureRestoredFCP(pageshowEvent: PageTransitionEvent, callback: (fcp: Duration) => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const fcp = performance.now() - pageshowEvent.timeStamp
      callback(fcp as Duration)
    })
  })
}

export function measureRestoredLCP(pageshowEvent: PageTransitionEvent, callback: (lcp: Duration) => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const lcp = performance.now() - pageshowEvent.timeStamp
      callback(lcp as Duration)
    })
  })
}
export function measureRestoredFID(
  pageshowEvent: PageTransitionEvent,
  callback: (fid: { delay: Duration; time: Duration }) => void
): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const fidDelay = 0 as Duration
      const fidTime = performance.now() - pageshowEvent.timeStamp
      callback({ delay: fidDelay, time: fidTime as Duration })
    })
  })
}
