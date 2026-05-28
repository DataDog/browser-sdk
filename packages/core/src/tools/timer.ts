import { getZoneJsOriginalValue } from './getZoneJsOriginalValue'
import { monitor } from './monitor'
import { globalObject } from './globalObject'

export type TimeoutId = ReturnType<typeof globalThis.setTimeout>

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
