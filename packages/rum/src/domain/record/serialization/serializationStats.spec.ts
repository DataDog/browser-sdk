import {
  aggregateSerializationStats,
  createSerializationStats,
  updateCssTextSerializationStats,
} from './serializationStats'

describe('serializationStats', () => {
  describe('stats for _cssText', () => {
    it('can be updated', () => {
      const stats = createSerializationStats()

      updateCssTextSerializationStats(stats, 'div { color: blue; }'.length)
      expect(stats.cssText.count).toBe(1)
      expect(stats.cssText.max).toBe(20)
      expect(stats.cssText.sum).toBe(20)

      updateCssTextSerializationStats(stats, 'span { background-color: red; }'.length)
      expect(stats.cssText.count).toBe(2)
      expect(stats.cssText.max).toBe(31)
      expect(stats.cssText.sum).toBe(51)
    })
  })

  it('can be aggregated', () => {
    const aggregateStats = createSerializationStats()

    const stats1 = createSerializationStats()
    updateCssTextSerializationStats(stats1, 'div { color: blue; }'.length)
    updateCssTextSerializationStats(stats1, 'span { background-color: red; }'.length)
    aggregateSerializationStats(aggregateStats, stats1)

    const stats2 = createSerializationStats()
    updateCssTextSerializationStats(stats2, 'p { width: 100%; }'.length)
    aggregateSerializationStats(aggregateStats, stats2)

    expect(aggregateStats.cssText.count).toBe(3)
    expect(aggregateStats.cssText.max).toBe(31)
    expect(aggregateStats.cssText.sum).toBe(69)
  })
})
