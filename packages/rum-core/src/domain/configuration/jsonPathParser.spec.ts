import { parseJsonPath } from './jsonPathParser'

describe('parseJsonPath', () => {
  it('should parse variable names with dot notation', () => {
    expect(parseJsonPath('a')).toEqual(['a'])
    expect(parseJsonPath('foo.bar')).toEqual(['foo', 'bar'])
    expect(parseJsonPath('foo.bar.qux')).toEqual(['foo', 'bar', 'qux'])
  })

  it('should parse property names with bracket notation', () => {
    expect(parseJsonPath("['a']")).toEqual(['a'])
    expect(parseJsonPath('["a"]')).toEqual(['a'])
    expect(parseJsonPath('[\'foo\']["bar"]')).toEqual(['foo', 'bar'])
    expect(parseJsonPath("['foo']['bar']['qux']")).toEqual(['foo', 'bar', 'qux'])
  })

  it('should parse variable and property names mixed', () => {
    expect(parseJsonPath("['foo'].bar['qux']")).toEqual(['foo', 'bar', 'qux'])
  })

  it('should parse array indexes', () => {
    expect(parseJsonPath('[0]')).toEqual(['0'])
    expect(parseJsonPath('foo[12]')).toEqual(['foo', '12'])
    expect(parseJsonPath("['foo'][12]")).toEqual(['foo', '12'])
  })

  it('should parse property names with unsupported variable name characters', () => {
    expect(parseJsonPath("['foo\\n']")).toEqual(['foo\\n'])
    expect(parseJsonPath("['foo\\'']")).toEqual(["foo\\'"])
    expect(parseJsonPath('["foo\\""]')).toEqual(['foo\\"'])
    expect(parseJsonPath("['foo[]']")).toEqual(['foo[]'])
  })

  it('should return an empty array for an invalid path', () => {
    expect(parseJsonPath('.foo')).toEqual([])
    expect(parseJsonPath('.')).toEqual([])
    expect(parseJsonPath('foo.')).toEqual([])
    expect(parseJsonPath('foo..bar')).toEqual([])
    expect(parseJsonPath("[['foo']")).toEqual([])
    expect(parseJsonPath("['foo'")).toEqual([])
    expect(parseJsonPath("['foo]")).toEqual([])
    expect(parseJsonPath('[1')).toEqual([])
    expect(parseJsonPath('foo]')).toEqual([])
    expect(parseJsonPath("[foo']")).toEqual([])
    expect(parseJsonPath("['foo''bar']")).toEqual([])
    expect(parseJsonPath("['foo\\o']")).toEqual([])
    expect(parseJsonPath("['foo']a")).toEqual([])
    expect(parseJsonPath('["foo\']')).toEqual([])
  })
})
