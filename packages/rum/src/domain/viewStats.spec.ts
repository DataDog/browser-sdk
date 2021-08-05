import { getViewStats, getOrCreateViewStats, resetViewStats, MAX_STATS_HISTORY } from './viewStats'

describe('viewStats', () => {
  afterEach(() => {
    resetViewStats()
  })

  describe('getViewStats', () => {
    it('returns undefined for new views', () => {
      expect(getViewStats('view-id')).toBeUndefined()
    })

    it('returns existing view stats', () => {
      getOrCreateViewStats('view-id').records_count += 1
      expect(getViewStats('view-id')?.records_count).toBe(1)
    })
  })

  describe('getOrCreateViewStats', () => {
    it('returns empty stats for new views', () => {
      expect(getOrCreateViewStats('view-id')).toEqual({
        records_count: 0,
        segments_count: 0,
        segments_total_raw_size: 0,
      })
    })

    it('returns the existing stats', () => {
      getOrCreateViewStats('view-id').records_count += 1
      expect(getOrCreateViewStats('view-id').records_count).toBe(1)
    })

    it('cleans up old views when the history limit is reached', () => {
      for (let i = 0; i < MAX_STATS_HISTORY + 1; i += 1) {
        getOrCreateViewStats(`view-${i}`)
      }
      expect(getViewStats('view-0')).toBeUndefined()
    })
  })
})
