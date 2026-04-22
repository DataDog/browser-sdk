import { Pipeline } from '@datadog/core-next'
import { startResourceTimingCollection } from './resourceTimingCollector'

describe('startResourceTimingCollection', () => {
  it('returns a cleanup function', () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    pipeline.seal()
    const stop = startResourceTimingCollection(pipeline)
    expect(typeof stop).toBe('function')
    stop()
  })
})
