import { ViewReplayStats } from '../../../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'

export function trackReplayStats(lifeCycle: LifeCycle, viewId: string, callback: (stats: ViewReplayStats) => void) {
  const replayStats: ViewReplayStats = {
    records_count: 0,
    segments_count: 0,
    segments_total_raw_size: 0,
  }

  const { unsubscribe: stop } = lifeCycle.subscribe(LifeCycleEventType.REPLAY_STATS_UPDATED, (update) => {
    if (viewId === update.viewId) {
      replayStats.records_count += update.recordsCount || 0
      replayStats.segments_count += update.segmentsCount || 0
      replayStats.segments_total_raw_size += update.rawSize || 0
      callback(replayStats)
    }
  })
  return { stop }
}
