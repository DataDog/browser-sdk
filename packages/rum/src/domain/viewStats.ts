import { ViewReplayStats } from '@datadog/browser-rum-core'

export const MAX_STATS_HISTORY = 10
let statsPerView: Map<string, ViewReplayStats> | undefined

export function getOrCreateViewStats(viewId: string) {
  if (!statsPerView) {
    statsPerView = new Map()
  }

  let viewStats: ViewReplayStats
  if (statsPerView.has(viewId)) {
    viewStats = statsPerView.get(viewId)!
  } else {
    viewStats = {
      records_count: 0,
      segments_count: 0,
      segments_total_raw_size: 0,
    }
    statsPerView.set(viewId, viewStats)
    if (statsPerView.size > MAX_STATS_HISTORY) {
      deleteOldestStats()
    }
  }

  return viewStats
}

export function getViewStats(viewId: string) {
  return statsPerView?.get(viewId)
}

export function resetViewStats() {
  statsPerView = undefined
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
