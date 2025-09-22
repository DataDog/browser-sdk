import { aggregateSerializationStats, createSerializationStats, updateSerializationStats } from './serializationStats'

describe('serializationStats', () => {
  describe('stats for _cssText', () => {
    it('can be updated', () => {
      const stats = createSerializationStats()

      updateSerializationStats(stats, 'cssText', 'div { color: blue; }'.length)
      expect(stats.cssText.count).toBe(1)
      expect(stats.cssText.max).toBe(20)
      expect(stats.cssText.sum).toBe(20)

      updateSerializationStats(stats, 'cssText', 'span { background-color: red; }'.length)
      expect(stats.cssText.count).toBe(2)
      expect(stats.cssText.max).toBe(31)
      expect(stats.cssText.sum).toBe(51)
    })
  })

  describe('stats for serialization duration', () => {
    it('can be updated', () => {
      const stats = createSerializationStats()

      updateSerializationStats(stats, 'serializationDuration', 30)
      expect(stats.serializationDuration.count).toBe(1)
      expect(stats.serializationDuration.max).toBe(30)
      expect(stats.serializationDuration.sum).toBe(30)

      updateSerializationStats(stats, 'serializationDuration', 60)
      expect(stats.serializationDuration.count).toBe(2)
      expect(stats.serializationDuration.max).toBe(60)
      expect(stats.serializationDuration.sum).toBe(90)
    })
  })

  it('can be aggregated', () => {
    const aggregateStats = createSerializationStats()

    const stats1 = createSerializationStats()
    updateSerializationStats(stats1, 'cssText', 'div { color: blue; }'.length)
    updateSerializationStats(stats1, 'serializationDuration', 16)
    updateSerializationStats(stats1, 'cssText', 'span { background-color: red; }'.length)
    updateSerializationStats(stats1, 'serializationDuration', 32)
    aggregateSerializationStats(aggregateStats, stats1)

    const stats2 = createSerializationStats()
    updateSerializationStats(stats2, 'cssText', 'p { width: 100%; }'.length)
    updateSerializationStats(stats2, 'serializationDuration', 18)
    updateSerializationStats(stats2, 'serializationDuration', 9)
    aggregateSerializationStats(aggregateStats, stats2)

    expect(aggregateStats.cssText.count).toBe(3)
    expect(aggregateStats.cssText.max).toBe(31)
    expect(aggregateStats.cssText.sum).toBe(69)
    expect(aggregateStats.serializationDuration.count).toBe(4)
    expect(aggregateStats.serializationDuration.max).toBe(32)
    expect(aggregateStats.serializationDuration.sum).toBe(75)
  })
})
