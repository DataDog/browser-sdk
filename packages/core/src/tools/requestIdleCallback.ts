import { monitor } from './monitor'

/**
 * Use 'requestIdleCallback' when available: it will throttle the mutation processing if the
 * browser is busy rendering frames (ex: when frames are below 60fps). When not available, the
 * fallback on 'requestAnimationFrame' will still ensure the mutations are processed after any
 * browser rendering process (Layout, Recalculate Style, etc.), so we can serialize DOM nodes efficiently.
 *
 * Note: check both 'requestIdleCallback' and 'cancelIdleCallback' existence because some polyfills only implement 'requestIdleCallback'.
 */
export function requestIdleCallback(callback: () => void, opts?: { timeout?: number }) {
  if (window.requestIdleCallback && window.cancelIdleCallback) {
    const id = window.requestIdleCallback(monitor(callback), opts)
    return () => window.cancelIdleCallback(id)
  }
  const id = window.requestAnimationFrame(monitor(callback))
  return () => window.cancelAnimationFrame(id)
}
