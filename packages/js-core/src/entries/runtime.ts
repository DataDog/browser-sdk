import { createDisplay } from '../util/display'

interface GlobalWithOnReadyQueue {
  /** Queue of callbacks registered via a stub loader snippet before the real SDK was loaded. */
  q?: Array<() => void>
  /** Marker set by the real SDK once loaded, used to detect duplicate inclusion. */
  version?: string
}

/**
 * Exposes `api` as `global[name]`, the standard way Datadog SDKs publish themselves as a global
 * (e.g. `window.DD_RUM`).
 *
 * Warns if a previous SDK instance is already installed on `name` (guarding against duplicate
 * script inclusion), and flushes any callbacks queued by a stub loader snippet — the common
 * `window.DD_RUM = window.DD_RUM || { q: [], onReady: (cb) => window.DD_RUM.q.push(cb) }` pattern
 * used to queue `onReady` calls made before the real SDK script has loaded.
 *
 * @param global - The object to attach the API to, typically the global/window object.
 * @param name - The property name to define, e.g. `'DD_RUM'`.
 * @param api - The public API object to expose.
 */
export function defineGlobal<Global, Name extends keyof Global>(global: Global, name: Name, api: Global[Name]) {
  const display = createDisplay('Datadog SDK:')
  const existingGlobalVariable = global[name] as unknown as GlobalWithOnReadyQueue | undefined
  if (existingGlobalVariable && !existingGlobalVariable.q && existingGlobalVariable.version) {
    display.warn('SDK is loaded more than once. This is unsupported and might have unexpected behavior.')
  }
  global[name] = api
  if (existingGlobalVariable?.q) {
    existingGlobalVariable.q.forEach((fn) => callOnReadyCallback(display, fn))
  }
}

function callOnReadyCallback(display: ReturnType<typeof createDisplay>, fn: () => void) {
  try {
    fn()
  } catch (err) {
    display.error('onReady callback threw an error:', err)
  }
}
