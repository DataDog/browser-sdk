import { toFormEntries } from './buildReplayPayload'

describe('toFormEntries', () => {
  let callbackSpy: jasmine.Spy<(key: string, value: string) => void>

  beforeEach(() => {
    callbackSpy = jasmine.createSpy()
  })

  it('handles top level properties', () => {
    toFormEntries({ foo: 'bar', zig: 'zag' }, callbackSpy)
    expect(callbackSpy.calls.allArgs()).toEqual([
      ['foo', 'bar'],
      ['zig', 'zag'],
    ])
  })

  it('handles nested properties', () => {
    toFormEntries({ foo: { bar: 'baz', zig: { zag: 'zug' } } }, callbackSpy)
    expect(callbackSpy.calls.allArgs()).toEqual([
      ['foo.bar', 'baz'],
      ['foo.zig.zag', 'zug'],
    ])
  })

  it('converts values to string', () => {
    toFormEntries({ foo: 42, bar: null }, callbackSpy)
    expect(callbackSpy.calls.allArgs()).toEqual([
      ['foo', '42'],
      ['bar', 'null'],
    ])
  })
})
