import type { TimeoutId } from '@datadog/js-core/util'
import {
  setTimeout as coreSetTimeout,
  clearTimeout as coreClearTimeout,
  setInterval as coreSetInterval,
  clearInterval as coreClearInterval,
} from '@datadog/js-core/util'
import { monitor } from './monitor'

export type { TimeoutId }

// @datadog/js-core/util's timer functions already bypass Zone.js patching; we only need to add
// browser-core's monitor() wrapping on top, so errors thrown in the callback are still caught and
// reported instead of becoming uncaught exceptions.

export function setTimeout(callback: () => void, delay?: number): TimeoutId {
  return coreSetTimeout(monitor(callback), delay)
}

export function clearTimeout(timeoutId: TimeoutId | undefined) {
  coreClearTimeout(timeoutId)
}

export function setInterval(callback: () => void, delay?: number): TimeoutId {
  return coreSetInterval(monitor(callback), delay)
}

export function clearInterval(timeoutId: TimeoutId | undefined) {
  coreClearInterval(timeoutId)
}
