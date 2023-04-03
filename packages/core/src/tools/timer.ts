import { getZoneJsOriginalValue } from './getZoneJsOriginalValue'
import { monitor } from './monitor'

export type TimeoutId = ReturnType<typeof window.setTimeout>

export function setTimeout(callback: () => void, delay?: number): TimeoutId {
  return getZoneJsOriginalValue(window, 'setTimeout')(monitor(callback), delay)
}

export function clearTimeout(timeoutId: TimeoutId | undefined) {
  getZoneJsOriginalValue(window, 'clearTimeout')(timeoutId)
}

export function setInterval(callback: () => void, delay?: number): TimeoutId {
  return getZoneJsOriginalValue(window, 'setInterval')(monitor(callback), delay)
}

export function clearInterval(timeoutId: TimeoutId | undefined) {
  getZoneJsOriginalValue(window, 'clearInterval')(timeoutId)
}
