import { Pipeline } from '@datadog/core-next'
import { startLongTaskCollection } from './longTaskCollector'

describe('startLongTaskCollection', () => {
  it('returns a cleanup function', () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    pipeline.seal()
    const stop = startLongTaskCollection(pipeline)
    expect(typeof stop).toBe('function')
    stop()
  })
})
