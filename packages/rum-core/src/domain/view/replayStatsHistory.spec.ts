import { registerCleanupTask } from '@datadog/browser-core/test'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import { startReplayStatsHistory } from './replayStatsHistory'
import type { ReplayStatsHistory } from './replayStatsHistory'

describe('replayStats', () => {
  let lifeCycle: LifeCycle
  let replayStatsHistory: ReplayStatsHistory

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    replayStatsHistory = startReplayStatsHistory(lifeCycle)

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
    it('cleans up old views when they are destroyed', () => {
      replayStatsHistory.addSegment('view-id')
      expect(replayStatsHistory.getReplayStats('view-id')).not.toBeUndefined()

      lifeCycle.notify(LifeCycleEventType.VIEW_DESTROYED, { id: 'view-id' })
      expect(replayStatsHistory.getReplayStats('view-id')).toBeUndefined()
    })
  })
})
