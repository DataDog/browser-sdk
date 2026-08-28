import type { TimeoutId } from '@datadog/js-core/util'
import {
  setTimeout as jsCoreSetTimeout,
  setInterval as jsCoreSetInterval,
  clearTimeout as jsCoreClearTimeout,
  clearInterval as jsCoreClearInterval,
} from '@datadog/js-core/util'
import { monitor } from '@datadog/js-core/monitor'

export type { TimeoutId }

export function setTimeout(callback: () => void, delay?: number): TimeoutId {
  return jsCoreSetTimeout(monitor(callback), delay)
}

export function clearTimeout(timeoutId: TimeoutId | undefined) {
  jsCoreClearTimeout(timeoutId)
}

export function setInterval(callback: () => void, delay?: number): TimeoutId {
  return jsCoreSetInterval(monitor(callback), delay)
}

export function clearInterval(timeoutId: TimeoutId | undefined) {
  jsCoreClearInterval(timeoutId)
}
