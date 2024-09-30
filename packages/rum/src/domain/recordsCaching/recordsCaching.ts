import { setInterval, clearInterval, timeStampNow } from '@datadog/browser-core'
import type { TimeStamp } from '@datadog/browser-core'
import type { LifeCycle } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'
import type { BrowserRecord } from '../../types'
import { squashRecords } from '../squashing'

const SQUASHING_INTERVAL = 15_000

export function startRecordsCaching(lifeCycle: LifeCycle) {
  let cachedRecords: BrowserRecord[] = []
  // Periodically squash cached records every 30 seconds
  const intervalId = setInterval(squashCachedRecords, 2 * SQUASHING_INTERVAL)

  // Clear records when view ends
  const subscription = lifeCycle.subscribe(LifeCycleEventType.AFTER_VIEW_ENDED, () => {
    clearInterval(intervalId)
    clearCache()
  })

  function addRecord(record: BrowserRecord) {
    cachedRecords.push(record)
  }

  function clearCache() {
    cachedRecords = []
  }

  function getRecords() {
    return cachedRecords
  }

  function squashCachedRecords() {
    const squashingTimestamp = (timeStampNow() - SQUASHING_INTERVAL) as TimeStamp
    const [recordsBeforeSeekTs, recordsAfterSeekTs] = partition(
      cachedRecords,
      (r: BrowserRecord) => r.timestamp <= squashingTimestamp
    )

    const squashedRecords = squashRecords(recordsBeforeSeekTs, squashingTimestamp)
    cachedRecords = squashedRecords.concat(recordsAfterSeekTs)
  }

  function clearCachingInterval() {
    clearInterval(intervalId)
  }

  function stop() {
    subscription.unsubscribe()
    clearInterval(intervalId)
    clearCache()
  }

  return {
    stop,
    addRecord,
    getRecords,
    squashCachedRecords,
    clearCachingInterval,
  }
}

function partition<T>(array: T[], predicate: (value: T) => boolean): [T[], T[]] {
  const truthy: T[] = []
  const falsy: T[] = []

  array.forEach((item) => {
    if (predicate(item)) {
      truthy.push(item)
    } else {
      falsy.push(item)
    }
  })

  return [truthy, falsy]
}
