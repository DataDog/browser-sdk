import { getReplayStats, resetReplayStats, MAX_STATS_HISTORY, addSegment, addRecord, addWroteData } from './replayStats'

describe('replayStats', () => {
  afterEach(() => {
    resetReplayStats()
  })

  describe('getReplayStats', () => {
    it('returns undefined for new views', () => {
      expect(getReplayStats('view-id')).toBeUndefined()
    })

    it('returns existing replay stats', () => {
      addRecord('view-id')
      expect(getReplayStats('view-id')?.records_count).toBe(1)
    })
  })

  describe('addSegment', () => {
    it('increments the view segments count', () => {
      addSegment('view-id')
      addSegment('view-id')
      expect(getReplayStats('view-id')!.segments_count).toBe(2)
    })
  })

  describe('addRecord', () => {
    it('increments the view records count', () => {
      addRecord('view-id')
      addRecord('view-id')
      expect(getReplayStats('view-id')!.records_count).toBe(2)
    })
  })

  describe('addWroteData', () => {
    it('increments the view records count', () => {
      addWroteData('view-id', 10)
      addWroteData('view-id', 20)
      expect(getReplayStats('view-id')!.segments_total_raw_size).toBe(30)
    })
  })

  describe('garbage collection', () => {
    it('cleans up old views when the history limit is reached', () => {
      for (let i = 0; i < MAX_STATS_HISTORY + 1; i += 1) {
        addSegment(`view-${i}`)
      }
      expect(getReplayStats('view-0')).toBeUndefined()
    })
  })
})
