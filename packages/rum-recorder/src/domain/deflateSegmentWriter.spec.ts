import { noop, setDebugMode } from '@datadog/browser-core'

import { MockWorker } from '../../test/utils'
import { SegmentMeta } from '../types'
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
    worker.process()
    expect(onWroteSpy.calls.allArgs()).toEqual([[3]])
  })

  it('calls the onFlushed callback when data is flush', () => {
    const onFlushedSpy = jasmine.createSpy<(data: Uint8Array, meta: SegmentMeta) => void>()
    const writer = new DeflateSegmentWriter(worker, noop, onFlushedSpy)
    const meta: SegmentMeta = { start: 12 } as any
    writer.flush(undefined, meta)
    worker.process()
    expect(onFlushedSpy.calls.allArgs()).toEqual([[jasmine.any(Uint8Array), meta]])
  })

  it('calls the onFlushed callback with the correct meta even if a previous action failed somehow', () => {
    const consoleSpy = spyOn(console, 'log')
    const onFlushedSpy = jasmine.createSpy<(data: Uint8Array, meta: SegmentMeta) => void>()
    const writer = new DeflateSegmentWriter(worker, noop, onFlushedSpy)
    const meta1: SegmentMeta = { start: 12 } as any
    const meta2: SegmentMeta = { start: 13 } as any
    writer.flush(undefined, meta1)
    writer.flush(undefined, meta2)
    worker.process(0)
    expect(onFlushedSpy.calls.allArgs()).toEqual([[jasmine.any(Uint8Array), meta2]])
    expect(consoleSpy).toHaveBeenCalledWith('[MONITORING MESSAGE]', '1 deflate worker responses have been lost')
  })
})
