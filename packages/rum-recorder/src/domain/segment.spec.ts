import { Record, RecordType, SegmentContext, SegmentMeta } from '../types'
import { RecordsIncrementalState, Segment, SegmentWriter } from './segment'

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
})
