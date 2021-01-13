import { noop } from '@datadog/browser-core'

import { MockWorker } from '../../test/utils'
import { SegmentMeta } from '../types'
import { DeflateSegmentWriter } from './deflateSegmentWriter'

describe('DeflateWriter', () => {
  let worker: MockWorker

  beforeEach(() => {
    worker = new MockWorker()
  })

  it('calls the onWrote callback when data is written', () => {
    const onWroteSpy = jasmine.createSpy<(size: number) => void>()
    const writer = new DeflateSegmentWriter(worker, onWroteSpy, noop)
    writer.write('foo')
    worker.process()
    expect(onWroteSpy.calls.allArgs()).toEqual([[3]])
  })

  it('calls the onCompleted callback when data is complete', () => {
    const onCompletedSpy = jasmine.createSpy<(data: Uint8Array, meta: SegmentMeta) => void>()
    const writer = new DeflateSegmentWriter(worker, noop, onCompletedSpy)
    const meta: SegmentMeta = { start: 12 } as any
    writer.complete(undefined, meta)
    worker.process()
    expect(onCompletedSpy.calls.allArgs()).toEqual([[jasmine.any(Uint8Array), meta]])
  })

  it('calls the onCompleted callback with the correct meta even if a previous action failed somehow', () => {
    const onCompletedSpy = jasmine.createSpy<(data: Uint8Array, meta: SegmentMeta) => void>()
    const writer = new DeflateSegmentWriter(worker, noop, onCompletedSpy)
    const meta1: SegmentMeta = { start: 12 } as any
    const meta2: SegmentMeta = { start: 13 } as any
    writer.complete(undefined, meta1)
    writer.complete(undefined, meta2)
    worker.process(0)
    expect(onCompletedSpy.calls.allArgs()).toEqual([[jasmine.any(Uint8Array), meta2]])
  })
})
