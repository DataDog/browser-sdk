import { noop, setDebugMode } from '@datadog/browser-core'

import { MockWorker } from '../../test/utils'
import { DeflateSegmentWriter } from './deflateSegmentWriter'

describe('DeflateWriter', () => {
  let worker: MockWorker

  beforeEach(() => {
    worker = new MockWorker()
    setDebugMode(true)
  })

  afterEach(() => {
    setDebugMode(false)
  })

  it('calls the onWrote callback when data is written', () => {
    const onWroteSpy = jasmine.createSpy<(size: number) => void>()
    const writer = new DeflateSegmentWriter(worker, onWroteSpy, noop)
    writer.write('foo')
    worker.processAll()
    expect(onWroteSpy.calls.allArgs()).toEqual([[3]])
  })

  it('calls the onFlushed callback when data is flush', () => {
    const onFlushedSpy = jasmine.createSpy<(data: Uint8Array) => void>()
    const writer = new DeflateSegmentWriter(worker, noop, onFlushedSpy)
    writer.flush(undefined)
    worker.processAll()
    expect(onFlushedSpy.calls.allArgs()).toEqual([[jasmine.any(Uint8Array)]])
  })

  it('calls the onWrote callbacks separately when two DeflateSegmentWriter are used', () => {
    const onWroteSpy1 = jasmine.createSpy<(size: number) => void>()
    const onWroteSpy2 = jasmine.createSpy<(size: number) => void>()
    const writer1 = new DeflateSegmentWriter(worker, onWroteSpy1, noop)
    writer1.write('cake')
    writer1.flush(undefined)
    const writer2 = new DeflateSegmentWriter(worker, onWroteSpy2, noop)
    writer2.write('potato')
    worker.processAll()
    expect(onWroteSpy1).toHaveBeenCalledOnceWith('cake'.length)
    expect(onWroteSpy2).toHaveBeenCalledOnceWith('potato'.length)
  })

  it('unsubscribes from the worker if a flush() response fails and another DeflateSegmentWriter is used', () => {
    const consoleSpy = spyOn(console, 'log')
    const writer1 = new DeflateSegmentWriter(worker, noop, noop)
    writer1.flush(undefined)
    const writer2 = new DeflateSegmentWriter(worker, noop, noop)
    writer2.write('foo')
    worker.skipOne()
    worker.processAll()
    expect(worker.listenersCount).toBe(1)
    expect(consoleSpy).toHaveBeenCalledWith(
      '[MONITORING MESSAGE]',
      "DeflateSegmentWriter did not receive a 'flush' response before being replaced."
    )
  })
})
