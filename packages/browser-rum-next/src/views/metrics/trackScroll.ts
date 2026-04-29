export interface ScrollMetrics {
  maxDepth: number
  maxScrollHeight: number
}

export interface ScrollTracker {
  start(): void
  stop(): void
  get(): ScrollMetrics | undefined
}

export function trackScroll(): ScrollTracker {
  let maxDepth = 0
  let maxScrollHeight = 0
  let listener: (() => void) | undefined
  let started = false

  function measure() {
    const scrollEl = document.scrollingElement || document.documentElement
    const scrollTop = scrollEl.scrollTop
    const viewportHeight = window.innerHeight
    const scrollHeight = scrollEl.scrollHeight

    const depth = Math.min(scrollTop + viewportHeight, scrollHeight)
    if (depth > maxDepth) maxDepth = depth
    if (scrollHeight > maxScrollHeight) maxScrollHeight = scrollHeight
  }

  return {
    start() {
      if (started) return
      started = true

      let timer: ReturnType<typeof setTimeout> | undefined
      listener = () => {
        if (timer) return
        timer = setTimeout(() => {
          measure()
          timer = undefined
        }, 1000)
      }
      window.addEventListener('scroll', listener, { passive: true })
      measure()
    },

    stop() {
      if (listener) {
        window.removeEventListener('scroll', listener)
        listener = undefined
      }
      started = false
    },

    get() {
      return maxDepth > 0 ? { maxDepth, maxScrollHeight } : undefined
    },
  }
}
