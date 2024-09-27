import { timeStampNow } from '@datadog/browser-core'
import type { TimeStamp } from '@datadog/browser-core'
import type { BrowserRecord } from '../../types'
import { squashRecords } from '../squashing'

const SQUASHING_INTERVAL = 15_000

export function startRecordsCaching() {
  let cachedRecords: BrowserRecord[] = []

  function addRecord(record: BrowserRecord) {
    cachedRecords.push(record)
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

  return {
    addRecord,
    getRecords,
    squashCachedRecords,
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
