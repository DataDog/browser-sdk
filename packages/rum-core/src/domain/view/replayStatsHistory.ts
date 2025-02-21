import type { ReplayStats } from '../../rawRumEvent.types'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'

export type ReplayStatsHistory = ReturnType<typeof startReplayStatsHistory>

export function startReplayStatsHistory(lifeCycle: LifeCycle) {
  let statsByView: Map<string, ReplayStats> | undefined

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
    return replayStats
  }

  const { unsubscribe } = lifeCycle.subscribe(LifeCycleEventType.VIEW_DESTROYED, ({ id }) => {
    statsByView?.delete(id)
  })

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
      unsubscribe()
    },
  }
}
