import { getReplayStats, getOrCreateReplayStats, resetReplayStats, MAX_STATS_HISTORY } from './replayStats'

describe('replayStats', () => {
  afterEach(() => {
    resetReplayStats()
  })

  describe('getReplayStats', () => {
    it('returns undefined for new views', () => {
      expect(getReplayStats('view-id')).toBeUndefined()
    })

    it('returns existing replay stats', () => {
      getOrCreateReplayStats('view-id').records_count += 1
      expect(getReplayStats('view-id')?.records_count).toBe(1)
    })
  })

  describe('getOrCreateReplayStats', () => {
    it('returns empty stats for new views', () => {
      expect(getOrCreateReplayStats('view-id')).toEqual({
        records_count: 0,
        segments_count: 0,
        segments_total_raw_size: 0,
      })
    })

    it('returns the existing stats', () => {
      getOrCreateReplayStats('view-id').records_count += 1
      expect(getOrCreateReplayStats('view-id').records_count).toBe(1)
    })

    it('cleans up old views when the history limit is reached', () => {
      for (let i = 0; i < MAX_STATS_HISTORY + 1; i += 1) {
        getOrCreateReplayStats(`view-${i}`)
      }
      expect(getReplayStats('view-0')).toBeUndefined()
    })
  })
})
