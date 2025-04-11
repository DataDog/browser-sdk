import { clearTimeout, sanitize, setTimeout } from '@datadog/browser-core'
import type { TransportManager } from '../transportManager'
import type { FeatureFlagEvent } from '../event'
import { EVENT } from '../event'

const cache = new Map<unknown, unknown>()
const debounceFns = new Map<unknown, (callback: () => void) => void>()

function createDebounceFn() {
  let timeout: number | undefined

  return (callback: () => void) => {
    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(() => {
      callback()
      timeout = undefined
    }, 100)
  }
}

export function addFeatureFlagEvaluation(transportManager: TransportManager, key: unknown, value: unknown) {
  // avoid sending the same value multiple times
  if (cache.get(key) === value) {
    return
  }

  cache.set(key, value)

  // debounce the sending of the event
  if (!debounceFns.has(key)) {
    debounceFns.set(key, createDebounceFn())
  }
  const debounce = debounceFns.get(key)!

  const data: FeatureFlagEvent = {
    type: EVENT.FEATURE_FLAG,
    key: sanitize(key) as string,
    value: sanitize(value),
  }

  debounce(() => transportManager.send(data))
}
