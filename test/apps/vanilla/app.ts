import { datadogLogs } from '@datadog/browser-logs'
import { datadogRum } from '@datadog/browser-rum'
import { datadogDebugger } from '@datadog/browser-debugger'
import { makeWasmPlugin } from '@datadog/browser-plugin-wasm'

declare global {
  interface Window {
    LOGS_INIT?: () => void
    RUM_INIT?: () => void
    DEBUGGER_INIT?: () => void
    DD_WASM_PLUGIN?: typeof makeWasmPlugin
  }
}

if (typeof window !== 'undefined') {
  // Expose the WebAssembly plugin so E2E tests can register it on the RUM/Logs SDKs that share
  // this bundle's browser-core instance (and thus its wasm module registry).
  window.DD_WASM_PLUGIN = makeWasmPlugin

  if (window.LOGS_INIT) {
    window.LOGS_INIT()
  }

  if (window.RUM_INIT) {
    window.RUM_INIT()
  }

  if (window.DEBUGGER_INIT) {
    window.DEBUGGER_INIT()
  }
} else {
  // compat test
  datadogLogs.init({ clientToken: 'xxx', beforeSend: undefined })
  datadogRum.init({ clientToken: 'xxx', applicationId: 'xxx', beforeSend: undefined })
  datadogRum.setUser({ id: undefined })
  datadogDebugger.init({ clientToken: 'xxx', service: 'xxx' })
}
