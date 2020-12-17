import { makeMouseMoveRecord } from '../../test/utils'
import { IncrementalSource, Record, RecordType } from '../types'
import { getRecordStartEnd, groupMouseMoves, isMouseMoveRecord } from './recordUtils'

const domContentLoadedRecord: Record = {
  data: {},
  timestamp: 100,
  type: RecordType.DomContentLoaded,
}

const inputRecord: Record = {
  data: {
    id: 123,
    isChecked: true,
    source: IncrementalSource.Input,
    text: '123',
  },
  timestamp: 123,
  type: RecordType.IncrementalSnapshot,
}

describe('isMouseMoveRecord', () => {
  it('returns false for non-MouseMove records', () => {
    expect(isMouseMoveRecord(domContentLoadedRecord)).toBe(false)
    expect(isMouseMoveRecord(inputRecord)).toBe(false)
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
    expect(getRecordStartEnd(domContentLoadedRecord)).toEqual([100, 100])
    expect(getRecordStartEnd(inputRecord)).toEqual([123, 123])
  })

  it("returns the time from the first mouse position as 'start' for MouseMove records", () => {
    expect(
      getRecordStartEnd(makeMouseMoveRecord(150, [{ timeOffset: -50 }, { timeOffset: -30 }, { timeOffset: 0 }]))
    ).toEqual([100, 150])
  })
})
