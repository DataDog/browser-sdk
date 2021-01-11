import { makeMouseMoveRecord } from '../../test/utils'
import { IncrementalSource, MouseMoveRecord, Record, RecordType, SegmentContext, SegmentMeta } from '../types'
import {
  MAX_MOUSE_MOVE_BATCH,
  MAX_SEGMENT_DURATION,
  RecordsIncrementalState,
  Segment,
  SegmentWriter,
  startSegmentCollection,
} from './segmentCollection'

class StringWriter implements SegmentWriter {
  output = ''
  completed: Array<{ meta: SegmentMeta; segment: SegmentMeta & { records: Record[] } }> = []
  write(data: string) {
    this.output += data
  }
  complete(data: string, meta: SegmentMeta) {
    this.completed.push({ meta, segment: JSON.parse(this.output + data) as any })
    this.output = ''
  }
}

const CONTEXT: SegmentContext = { application: { id: 'a' }, view: { id: 'b' }, session: { id: 'c' } }
const RECORD: Record = { type: RecordType.Load, timestamp: 10, data: {} }

describe('startSegmentCollection', () => {
  let writer: StringWriter

  beforeEach(() => {
    writer = new StringWriter()
  })

  afterEach(() => {
    jasmine.clock().uninstall()
  })

  it('immediately starts a new segment', () => {
    const { addRecord } = startSegmentCollection(() => CONTEXT, writer)
    expect(writer.output).toBe('')
    addRecord(RECORD)
    expect(writer.output).toBe('{"records":[{"type":1,"timestamp":10,"data":{}}')
    expect(writer.completed.length).toBe(0)
  })

  it('completes a segment when renewing it', () => {
    const { renewSegment, addRecord } = startSegmentCollection(() => CONTEXT, writer)
    addRecord(RECORD)
    renewSegment('before_unload')
    expect(writer.completed.length).toBe(1)
  })

  it('completes a segment after MAX_SEGMENT_DURATION', () => {
    jasmine.clock().install()
    const { addRecord } = startSegmentCollection(() => CONTEXT, writer)
    addRecord(RECORD)
    jasmine.clock().tick(MAX_SEGMENT_DURATION)
    expect(writer.completed.length).toBe(1)
  })

  it('does not complete a segment after MAX_SEGMENT_DURATION if a segment has been created in the meantime', () => {
    jasmine.clock().install()
    const { renewSegment, addRecord } = startSegmentCollection(() => CONTEXT, writer)
    addRecord(RECORD)
    renewSegment('before_unload')
    expect(writer.completed.length).toBe(1)
    jasmine.clock().tick(MAX_SEGMENT_DURATION)
    expect(writer.completed.length).toBe(1)
  })

  it("ignores calls to addRecord if context can't be get", () => {
    const { renewSegment, addRecord } = startSegmentCollection(() => undefined, writer)
    addRecord(RECORD)
    renewSegment('before_unload')
    expect(writer.output).toBe('')
    expect(writer.completed.length).toBe(0)
  })
})

describe('Segment', () => {
  it('writes a segment', () => {
    const writer = new StringWriter()
    const segment = new Segment(writer, CONTEXT, 'init')
    segment.addRecord({ type: RecordType.Load, timestamp: 10, data: {} })
    expect(writer.output).toEqual('{"records":[{"type":1,"timestamp":10,"data":{}}')
    expect(writer.completed).toEqual([])
    segment.finish()

    expect(writer.completed).toEqual([
      {
        meta: {
          creation_reason: 'init' as const,
          end: 10,
          has_full_snapshot: false,
          records_count: 1,
          start: 10,
          ...CONTEXT,
        },
        segment: {
          creation_reason: 'init' as const,
          end: 10,
          has_full_snapshot: false,
          records: [
            {
              data: {},
              timestamp: 10,
              type: RecordType.Load,
            },
          ],
          records_count: 1,
          start: 10,
          ...CONTEXT,
        },
      },
    ])
  })

  it('batches mousemove records', () => {
    const writer = new StringWriter()
    const segment = new Segment(writer, CONTEXT, 'init')
    segment.addRecord(makeMouseMoveRecord(10, [{ id: 0 }]))
    segment.addRecord(makeMouseMoveRecord(20, [{ id: 1 }]))
    segment.addRecord(makeMouseMoveRecord(30, [{ id: 2 }]))
    segment.finish()

    expect(writer.completed[0].segment.records).toEqual([
      makeMouseMoveRecord(30, [
        { id: 0, timeOffset: -20 },
        { id: 1, timeOffset: -10 },
        { id: 2, timeOffset: 0 },
      ]),
    ])
  })

  it('flushes the mousemove records batch after a max number of records', () => {
    const writer = new StringWriter()
    const segment = new Segment(writer, CONTEXT, 'init')
    for (let i = 0; i < MAX_MOUSE_MOVE_BATCH + 2; i += 1) {
      segment.addRecord(makeMouseMoveRecord(10, [{ id: 0 }]))
    }
    segment.finish()

    const records = writer.completed[0].segment.records as MouseMoveRecord[]
    expect(records.length).toBe(2)
    expect(records[0].data.positions.length).toBe(MAX_MOUSE_MOVE_BATCH)
    expect(records[1].data.positions.length).toBe(2)
  })

  it('ignores the "finish" call if no record have been added', () => {
    const writer = new StringWriter()
    const segment = new Segment(writer, CONTEXT, 'init')
    segment.finish()
    expect(writer.completed).toEqual([])
  })
})

describe('RecordsIncrementalState', () => {
  it('initializes with the data of the first record', () => {
    const state = new RecordsIncrementalState({ type: RecordType.Load, timestamp: 10, data: {} })
    expect(state.start).toBe(10)
    expect(state.end).toBe(10)
    expect(state.hasFullSnapshot).toBe(false)
    expect(state.recordsCount).toBe(1)
  })

  it('adjusts the state when adding a record', () => {
    const state = new RecordsIncrementalState({ type: RecordType.Load, timestamp: 10, data: {} })
    state.addRecord({ type: RecordType.DomContentLoaded, timestamp: 15, data: {} })
    expect(state.start).toBe(10)
    expect(state.end).toBe(15)
    expect(state.hasFullSnapshot).toBe(false)
    expect(state.recordsCount).toBe(2)
  })

  it("doesn't set hasFullSnapshot to true if a FullSnapshot is the first record", () => {
    const state = new RecordsIncrementalState({ type: RecordType.FullSnapshot, timestamp: 10, data: {} as any })
    expect(state.hasFullSnapshot).toBe(false)
  })

  it("doesn't set hasFullSnapshot to true if a FullSnapshot is not directly preceded by a Meta record", () => {
    const state = new RecordsIncrementalState({ type: RecordType.Load, timestamp: 10, data: {} })
    state.addRecord({ type: RecordType.FullSnapshot, timestamp: 10, data: {} as any })
    expect(state.hasFullSnapshot).toBe(false)
  })

  it('sets hasFullSnapshot to true if a FullSnapshot is preceded by a Meta record', () => {
    const state = new RecordsIncrementalState({ type: RecordType.Load, timestamp: 10, data: {} })
    state.addRecord({ type: RecordType.Meta, timestamp: 10, data: {} as any })
    state.addRecord({ type: RecordType.FullSnapshot, timestamp: 10, data: {} as any })
    expect(state.hasFullSnapshot).toBe(true)
  })

  it("doesn't overrides hasFullSnapshot to false once it has been set to true", () => {
    const state = new RecordsIncrementalState({ type: RecordType.Load, timestamp: 10, data: {} })
    state.addRecord({ type: RecordType.Meta, timestamp: 10, data: {} as any })
    state.addRecord({ type: RecordType.FullSnapshot, timestamp: 10, data: {} as any })
    state.addRecord({ type: RecordType.DomContentLoaded, timestamp: 10, data: {} as any })
    expect(state.hasFullSnapshot).toBe(true)
  })

  it('use records start/end for mouse moves', () => {
    const state = new RecordsIncrementalState({ type: RecordType.Load, timestamp: 10, data: {} })
    state.addRecord({
      data: { source: IncrementalSource.MouseMove, positions: [{ timeOffset: -2, x: 0, y: 0, id: 0 }] },
      timestamp: 11,
      type: RecordType.IncrementalSnapshot,
    })
    expect(state.start).toBe(9)
    expect(state.end).toBe(11)
  })
})
