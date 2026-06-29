import type { GlobalObject } from '@datadog/js-core/util'
import { globalObject } from '@datadog/js-core/util'
import { getZoneJsOriginalValue } from './getZoneJsOriginalValue'
import { monitor } from './monitor'

export type TimeoutId = ReturnType<GlobalObject['setTimeout']>

export function setTimeout(callback: () => void, delay?: number): TimeoutId {
  return getZoneJsOriginalValue(globalObject, 'setTimeout')(monitor(callback), delay)
}

export function clearTimeout(timeoutId: TimeoutId | undefined) {
  getZoneJsOriginalValue(globalObject, 'clearTimeout')(timeoutId)
}

export function setInterval(callback: () => void, delay?: number): TimeoutId {
  return getZoneJsOriginalValue(globalObject, 'setInterval')(monitor(callback), delay)
}

export function clearInterval(timeoutId: TimeoutId | undefined) {
  getZoneJsOriginalValue(globalObject, 'clearInterval')(timeoutId)
}
