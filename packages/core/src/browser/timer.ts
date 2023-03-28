import { getZoneJsOriginalValue } from '../tools/getZoneJsOriginalValue'
import { monitor } from '../tools/monitor'
import { getGlobalObject } from '../tools/getGlobalObject'

export type TimeoutId = ReturnType<typeof window.setTimeout>

export function setTimeout(callback: () => void, delay?: number): TimeoutId {
  return getZoneJsOriginalValue(getGlobalObject<Window>(), 'setTimeout')(monitor(callback), delay)
}

export function clearTimeout(timeoutId: TimeoutId | undefined) {
  getZoneJsOriginalValue(getGlobalObject<Window>(), 'clearTimeout')(timeoutId)
}

export function setInterval(callback: () => void, delay?: number): TimeoutId {
  return getZoneJsOriginalValue(window, 'setInterval')(monitor(callback), delay)
}

export function clearInterval(timeoutId: TimeoutId | undefined) {
  getZoneJsOriginalValue(window, 'clearInterval')(timeoutId)
}
