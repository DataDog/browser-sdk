import { getZoneJsOriginalValue } from './getZoneJsOriginalValue'
import { monitor } from './monitor'
import { getGlobalObject } from './getGlobalObject'

export type TimeoutId = ReturnType<typeof globalThis.setTimeout>

export function setTimeout(callback: () => void, delay?: number): TimeoutId {
  return getZoneJsOriginalValue(getGlobalObject(), 'setTimeout')(monitor(callback), delay)
}

export function clearTimeout(timeoutId: TimeoutId | undefined) {
  getZoneJsOriginalValue(getGlobalObject(), 'clearTimeout')(timeoutId)
}

export function setInterval(callback: () => void, delay?: number): TimeoutId {
  return getZoneJsOriginalValue(getGlobalObject(), 'setInterval')(monitor(callback), delay)
}

export function clearInterval(timeoutId: TimeoutId | undefined) {
  getZoneJsOriginalValue(getGlobalObject(), 'clearInterval')(timeoutId)
}
