import type { ReplayStats } from '../../rawRumEvent.types'

export const MAX_STATS_HISTORY = 1000
export type ReplayStatsHistory = ReturnType<typeof startReplayStatsHistory>

export function startReplayStatsHistory() {
  let statsByView: Map<string, ReplayStats> | undefined

  function deleteOldestStats() {
    if (!statsByView) {
      return
    }
    const toDelete = statsByView.keys().next().value
    if (toDelete) {
      statsByView.delete(toDelete)
    }
  }

  function getOrCreateReplayStats(viewId: string) {
    if (!statsByView) {
      statsByView = new Map()
    }

    if (statsByView.has(viewId)) {
      return statsByView.get(viewId)!
    }

    const replayStats: ReplayStats = {
      records_count: 0,
      segments_count: 0,
      segments_total_raw_size: 0,
    }
    statsByView.set(viewId, replayStats)

    if (statsByView.size > MAX_STATS_HISTORY) {
      deleteOldestStats()
    }

    return replayStats
  }

  return {
    getSegmentsCount(viewId: string) {
      return getOrCreateReplayStats(viewId).segments_count
    },

    addSegment(viewId: string) {
      getOrCreateReplayStats(viewId).segments_count += 1
    },

    addRecord(viewId: string) {
      getOrCreateReplayStats(viewId).records_count += 1
    },

    addWroteData(viewId: string, additionalBytesCount: number) {
      getOrCreateReplayStats(viewId).segments_total_raw_size += additionalBytesCount
    },

    getReplayStats(viewId: string) {
      return statsByView?.get(viewId)
    },

    stop() {
      statsByView = undefined
    },
  }
}
