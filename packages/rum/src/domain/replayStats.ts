import { ReplayStats } from '@datadog/browser-rum-core'

export const MAX_STATS_HISTORY = 10
let statsPerView: Map<string, ReplayStats> | undefined

export function addSegment(viewId: string) {
  getOrCreateReplayStats(viewId).segments_count += 1
}

export function addRecord(viewId: string) {
  getOrCreateReplayStats(viewId).records_count += 1
}

export function addWroteData(viewId: string, additionalRawSize: number) {
  getOrCreateReplayStats(viewId).segments_total_raw_size += additionalRawSize
}

export function getReplayStats(viewId: string) {
  return statsPerView?.get(viewId)
}

export function resetReplayStats() {
  statsPerView = undefined
}

function getOrCreateReplayStats(viewId: string) {
  if (!statsPerView) {
    statsPerView = new Map()
  }

  let replayStats: ReplayStats
  if (statsPerView.has(viewId)) {
    replayStats = statsPerView.get(viewId)!
  } else {
    replayStats = {
      records_count: 0,
      segments_count: 0,
      segments_total_raw_size: 0,
    }
    statsPerView.set(viewId, replayStats)
    if (statsPerView.size > MAX_STATS_HISTORY) {
      deleteOldestStats()
    }
  }

  return replayStats
}

function deleteOldestStats() {
  if (!statsPerView) {
    return
  }
  if (statsPerView.keys) {
    statsPerView.delete(statsPerView.keys().next().value)
  } else {
    // IE11 doesn't support map.keys
    let isFirst = true
    statsPerView.forEach((_value, key) => {
      if (isFirst) {
        statsPerView!.delete(key)
        isFirst = false
      }
    })
  }
}
