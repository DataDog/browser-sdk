import { registerCleanupTask } from '@datadog/browser-core/test'
import { MAX_STATS_HISTORY, startReplayStatsHistory } from './replayStatsHistory'
import type { ReplayStatsHistory } from './replayStatsHistory'

describe('replayStats', () => {
  let replayStatsHistory: ReplayStatsHistory

  beforeEach(() => {
    replayStatsHistory = startReplayStatsHistory()
    registerCleanupTask(() => {
      replayStatsHistory.stop()
    })
  })

  describe('getReplayStats', () => {
    it('returns undefined for new views', () => {
      expect(replayStatsHistory.getReplayStats('view-id')).toBeUndefined()
    })

    it('returns existing replay stats', () => {
      replayStatsHistory.addRecord('view-id')
      expect(replayStatsHistory.getReplayStats('view-id')?.records_count).toBe(1)
    })
  })

  describe('addSegment', () => {
    it('increments the view segments count', () => {
      replayStatsHistory.addSegment('view-id')
      replayStatsHistory.addSegment('view-id')
      expect(replayStatsHistory.getReplayStats('view-id')!.segments_count).toBe(2)
    })
  })

  describe('addRecord', () => {
    it('increments the view records count', () => {
      replayStatsHistory.addRecord('view-id')
      replayStatsHistory.addRecord('view-id')
      expect(replayStatsHistory.getReplayStats('view-id')!.records_count).toBe(2)
    })
  })

  describe('addWroteData', () => {
    it('increments the view records count', () => {
      replayStatsHistory.addWroteData('view-id', 10)
      replayStatsHistory.addWroteData('view-id', 20)
      expect(replayStatsHistory.getReplayStats('view-id')!.segments_total_raw_size).toBe(30)
    })
  })

  describe('garbage collection', () => {
    describe('garbage collection', () => {
      it('cleans up old views when the history limit is reached', () => {
        for (let i = 0; i < MAX_STATS_HISTORY + 1; i += 1) {
          replayStatsHistory.addSegment(`view-${i}`)
        }
        expect(replayStatsHistory.getReplayStats('view-0')).toBeUndefined()
      })
    })
  })
})
