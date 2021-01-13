import { makeMouseMoveRecord } from '../../test/utils'
import { IncrementalSource, MouseMoveRecord, Record, RecordType, SegmentContext, SegmentMeta } from '../types'
import {
  getRecordStartEnd,
  groupMouseMoves,
  isMouseMoveRecord,
  MAX_MOUSE_MOVE_BATCH,
  RecordsIncrementalState,
  Segment,
  SegmentWriter,
} from './segment'

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

const INPUT_RECORD: Record = {
  data: {
    id: 123,
    isChecked: true,
    source: IncrementalSource.Input,
    text: '123',
  },
  timestamp: 123,
  type: RecordType.IncrementalSnapshot,
}

describe('Segment', () => {
  it('writes a segment', () => {
    const writer = new StringWriter()
    const segment = new Segment(writer, CONTEXT, 'init')
    segment.addRecord({ type: RecordType.Load, timestamp: 10, data: {} })
    expect(writer.output).toEqual('{"records":[{"type":1,"timestamp":10,"data":{}}')
    expect(writer.completed).toEqual([])
    segment.complete()

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
    segment.complete()

    expect(writer.completed[0].segment.records).toEqual([
      makeMouseMoveRecord(30, [
        { id: 0, timeOffset: -20 },
        { id: 1, timeOffset: -10 },
        { id: 2, timeOffset: 0 },
      ]),
    ])
  })

  it('writes the mousemove records batch after a max number of records', () => {
    const writer = new StringWriter()
    const segment = new Segment(writer, CONTEXT, 'init')
    for (let i = 0; i < MAX_MOUSE_MOVE_BATCH + 2; i += 1) {
      segment.addRecord(makeMouseMoveRecord(10, [{ id: 0 }]))
    }
    segment.complete()

    const records = writer.completed[0].segment.records as MouseMoveRecord[]
    expect(records.length).toBe(2)
    expect(records[0].data.positions.length).toBe(MAX_MOUSE_MOVE_BATCH)
    expect(records[1].data.positions.length).toBe(2)
  })

  it('ignores the "complete" call if no record have been added', () => {
    const writer = new StringWriter()
    const segment = new Segment(writer, CONTEXT, 'init')
    segment.complete()
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

describe('isMouseMoveRecord', () => {
  it('returns false for non-MouseMove records', () => {
    expect(isMouseMoveRecord(RECORD)).toBe(false)
    expect(isMouseMoveRecord(INPUT_RECORD)).toBe(false)
  })

  it('returns true for MouseMove records', () => {
    expect(isMouseMoveRecord(makeMouseMoveRecord(100, []))).toBe(true)
  })
})

describe('groupMouseMoves', () => {
  it('returns the same event if a single event is provided', () => {
    const event = makeMouseMoveRecord(10, [{ id: 0 }])
    expect(groupMouseMoves([event])).toEqual(event)
  })

  it('groups mouse events in a single mouse event', () => {
    expect(
      groupMouseMoves([
        makeMouseMoveRecord(10, [{ id: 0 }]),
        makeMouseMoveRecord(14, [{ id: 1 }]),
        makeMouseMoveRecord(20, [{ id: 2 }]),
      ])
    ).toEqual(
      makeMouseMoveRecord(20, [
        { id: 0, timeOffset: -10 },
        { id: 1, timeOffset: -6 },
        { id: 2, timeOffset: 0 },
      ])
    )
  })
})

describe('getRecordStartEnd', () => {
  it("returns the timestamp as 'start' and 'end' for non-MouseMove records", () => {
    expect(getRecordStartEnd(RECORD)).toEqual([10, 10])
    expect(getRecordStartEnd(INPUT_RECORD)).toEqual([123, 123])
  })

  it("returns the time from the first mouse position as 'start' for MouseMove records", () => {
    expect(
      getRecordStartEnd(makeMouseMoveRecord(150, [{ timeOffset: -50 }, { timeOffset: -30 }, { timeOffset: 0 }]))
    ).toEqual([100, 150])
  })
})
