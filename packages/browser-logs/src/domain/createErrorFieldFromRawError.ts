import type { RawError } from '@datadog/browser-core'
import { getLoadedWasmModules, isWasmError } from '@datadog/browser-core'
import type { RawLoggerLogsEvent } from '../rawLogsEvent.types'

export function createErrorFieldFromRawError(
  rawError: RawError,
  {
    /**
     * Set this to `true` to include the error message in the error field. In most cases, the error
     * message is already included in the log message, so we don't need to include it again.
     */
    includeMessage = false,
  } = {}
): NonNullable<RawLoggerLogsEvent['error']> {
  const isWasm = isWasmError(rawError)

  return {
    stack: rawError.stack,
    kind: rawError.type,
    message: includeMessage ? rawError.message : undefined,
    causes: rawError.causes,
    fingerprint: rawError.fingerprint,
    handling: rawError.handling,
    source_type: isWasm ? 'browser+wasm' : 'browser',
    ...(isWasm ? { wasm_modules: getLoadedWasmModules() } : {}),
  }
}
