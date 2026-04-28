import { Pipeline } from '@datadog/core-next'
import { startPerformanceCollection } from './performanceCollector'

describe('startPerformanceCollection', () => {
  it('returns a cleanup function', () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    pipeline.seal()
    const stop = startPerformanceCollection(pipeline)
    expect(typeof stop).toBe('function')
    stop()
  })
})
