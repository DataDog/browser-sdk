import { IncrementalSource, RecordType } from '@datadog/browser-rum/src/types'
import type { BrowserRecord } from '@datadog/browser-rum/src/types'
import type { RecordListener } from './recordBuffer'
import { createRecordBuffer } from './recordBuffer'

const META_RECORD: BrowserRecord = {
  type: RecordType.Meta,
  timestamp: 1,
  data: { href: 'https://example.com', width: 800, height: 600 },
}

const SCROLL_RECORD: BrowserRecord = {
  type: RecordType.IncrementalSnapshot,
  timestamp: 2,
  data: { source: IncrementalSource.Scroll, id: 1, x: 0, y: 10 },
}

describe('createRecordBuffer', () => {
  it('drops the records that come before the first full snapshot', () => {
    const buffer = createRecordBuffer()

    buffer.add(SCROLL_RECORD)
    expect(buffer.getCount()).toBe(0)

    buffer.add(META_RECORD)
    buffer.add(SCROLL_RECORD)
    expect(buffer.getRecords()).toEqual([META_RECORD, SCROLL_RECORD])
    expect(buffer.getCount()).toBe(2)
  })

  it('starts over at each full snapshot', () => {
    const buffer = createRecordBuffer()
    buffer.add(META_RECORD)
    buffer.add(SCROLL_RECORD)

    const nextMetaRecord: BrowserRecord = { ...META_RECORD, timestamp: 3 }
    buffer.add(nextMetaRecord)

    expect(buffer.getRecords()).toEqual([nextMetaRecord])
  })

  it('notifies its listeners only of the records that it keeps', () => {
    const buffer = createRecordBuffer()
    const listener = jasmine.createSpy<RecordListener>()
    buffer.addListener(listener)

    buffer.add(SCROLL_RECORD)
    buffer.add(META_RECORD)

    expect(listener.calls.allArgs()).toEqual([[META_RECORD]])
  })

  it('notifies each new listener of the records that it already holds', () => {
    const buffer = createRecordBuffer()
    buffer.add(META_RECORD)
    buffer.add(SCROLL_RECORD)

    const listener = jasmine.createSpy<RecordListener>()
    buffer.addListener(listener)
    expect(listener.calls.allArgs()).toEqual([[META_RECORD], [SCROLL_RECORD]])

    buffer.add(SCROLL_RECORD)
    expect(listener.calls.allArgs()).toEqual([[META_RECORD], [SCROLL_RECORD], [SCROLL_RECORD]])
  })
})
