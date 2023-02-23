import { getZoneJsOriginalValue } from '../tools/getZoneJsOriginalValue'
import { monitor } from '../tools/monitor'

export type TimeoutId = ReturnType<typeof window.setTimeout>

export function setTimeout(callback: () => void, delay?: number): TimeoutId {
  return getZoneJsOriginalValue(window, 'setTimeout')(monitor(callback), delay)
}

export function clearTimeout(timeoutId: TimeoutId | undefined) {
  getZoneJsOriginalValue(window, 'clearTimeout')(timeoutId)
}
