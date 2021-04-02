import { Record, RecordType, SegmentContext, SegmentMeta } from '../types'
import { Segment, SegmentWriter } from './segment'

const CONTEXT: SegmentContext = { application: { id: 'a' }, view: { id: 'b' }, session: { id: 'c' } }

const RECORD: Record = { type: RecordType.ViewEnd, timestamp: 10 }
const FULL_SNAPSHOT_RECORD: Record = { type: RecordType.FullSnapshot, timestamp: 10, data: {} as any }

describe('Segment', () => {
  it('writes a segment', () => {
    const writer = new StringWriter()
    const segment = new Segment(writer, CONTEXT, 'init', RECORD)
    expect(writer.output).toEqual('{"records":[{"type":7,"timestamp":10}')
    expect(writer.flushed).toEqual([])
    segment.flush()

    expect(writer.flushed).toEqual([
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
              timestamp: 10,
              type: RecordType.ViewEnd,
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
    const segment = new Segment(writer, CONTEXT, 'init', RECORD)
    segment.addRecord({ type: RecordType.ViewEnd, timestamp: 15 })
    segment.flush()
    expect(writer.flushed[0].meta).toEqual({
      creation_reason: 'init',
      end: 15,
      has_full_snapshot: false,
      records_count: 2,
      start: 10,
      ...CONTEXT,
    })
  })

  it('sets has_full_snapshot to true if a segment has a FullSnapshot', () => {
    const writer = new StringWriter()
    const segment = new Segment(writer, CONTEXT, 'init', RECORD)
    segment.addRecord(FULL_SNAPSHOT_RECORD)
    segment.flush()
    expect(writer.flushed[0].meta.has_full_snapshot).toEqual(true)
  })

  it("doesn't overrides has_full_snapshot to false once it has been set to true", () => {
    const writer = new StringWriter()
    const segment = new Segment(writer, CONTEXT, 'init', RECORD)
    segment.addRecord(FULL_SNAPSHOT_RECORD)
    segment.addRecord(RECORD)
    segment.flush()
    expect(writer.flushed[0].meta.has_full_snapshot).toEqual(true)
  })
})

class StringWriter implements SegmentWriter {
  output = ''
  flushed: Array<{ meta: SegmentMeta; segment: SegmentMeta & { records: Record[] } }> = []
  write(data: string) {
    this.output += data
  }
  flush(data: string, meta: SegmentMeta) {
    this.flushed.push({ meta, segment: JSON.parse(this.output + data) })
    this.output = ''
  }
}
