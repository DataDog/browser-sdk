import { Record, RecordType, SegmentContext, SegmentMeta } from '../types'
import { Segment, SegmentWriter } from './segment'

const CONTEXT: SegmentContext = { application: { id: 'a' }, view: { id: 'b' }, session: { id: 'c' } }

const LOAD_RECORD: Record = { type: RecordType.Load, timestamp: 10, data: {} }
const FULLSNAPSHOT_RECORD: Record = { type: RecordType.FullSnapshot, timestamp: 10, data: {} as any }
const DOM_CONTENT_LOADED_RECORD: Record = { type: RecordType.DomContentLoaded, timestamp: 10, data: {} as any }
const META_RECORD: Record = { type: RecordType.Meta, timestamp: 10, data: {} as any }

describe('Segment', () => {
  it('writes a segment', () => {
    const writer = new StringWriter()
    const segment = new Segment(writer, CONTEXT, 'init', LOAD_RECORD)
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

  it('adjusts meta when adding a record', () => {
    const writer = new StringWriter()
    const segment = new Segment(writer, CONTEXT, 'init', LOAD_RECORD)
    segment.addRecord({ type: RecordType.DomContentLoaded, timestamp: 15, data: {} })
    segment.complete()
    expect(writer.completed[0].meta).toEqual({
      creation_reason: 'init',
      end: 15,
      has_full_snapshot: false,
      records_count: 2,
      start: 10,
      ...CONTEXT,
    })
  })

  it("doesn't set has_full_snapshot to true if a FullSnapshot is the initial record", () => {
    const writer = new StringWriter()
    const segment = new Segment(writer, CONTEXT, 'init', FULLSNAPSHOT_RECORD)
    segment.complete()
    expect(writer.completed[0].meta.has_full_snapshot).toEqual(false)
  })

  it("doesn't set has_full_snapshot to true if a FullSnapshot is not directly preceded by a Meta record", () => {
    const writer = new StringWriter()
    const segment = new Segment(writer, CONTEXT, 'init', LOAD_RECORD)
    segment.addRecord(FULLSNAPSHOT_RECORD)
    segment.complete()
    expect(writer.completed[0].meta.has_full_snapshot).toEqual(false)
  })

  it('sets has_full_snapshot to true if a FullSnapshot is preceded by a Meta record', () => {
    const writer = new StringWriter()
    const segment = new Segment(writer, CONTEXT, 'init', LOAD_RECORD)
    segment.addRecord(META_RECORD)
    segment.addRecord(FULLSNAPSHOT_RECORD)
    segment.complete()
    expect(writer.completed[0].meta.has_full_snapshot).toEqual(true)
  })

  it("doesn't overrides has_full_snapshot to false once it has been set to true", () => {
    const writer = new StringWriter()
    const segment = new Segment(writer, CONTEXT, 'init', LOAD_RECORD)
    segment.addRecord(META_RECORD)
    segment.addRecord(FULLSNAPSHOT_RECORD)
    segment.addRecord(DOM_CONTENT_LOADED_RECORD)
    segment.complete()
    expect(writer.completed[0].meta.has_full_snapshot).toEqual(true)
  })
})

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
