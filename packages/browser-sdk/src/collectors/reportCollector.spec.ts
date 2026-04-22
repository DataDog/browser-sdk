import { Pipeline } from '@datadog/core-next'
import { startReportCollection } from './reportCollector'

describe('startReportCollection', () => {
  let pipeline: Pipeline<Record<string, unknown>>

  beforeEach(() => {
    pipeline = new Pipeline<Record<string, unknown>>()
    pipeline.seal()
  })

  it('does not crash when ReportingObserver is not available', () => {
    expect(() => {
      startReportCollection(pipeline)
    }).not.toThrow()
  })

  it('stop() returns a function (even when ReportingObserver unavailable)', () => {
    const stop = startReportCollection(pipeline)
    expect(typeof stop).toBe('function')
    expect(() => stop()).not.toThrow()
  })
})
