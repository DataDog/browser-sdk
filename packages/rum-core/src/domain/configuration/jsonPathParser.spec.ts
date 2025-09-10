import { parseJsonPath } from './jsonPathParser'

describe('parseJsonPath', () => {
  it('should parse variable names with dot notation', () => {
    expect(parseJsonPath('a')).toEqual(['a'])
    expect(parseJsonPath('foo.bar')).toEqual(['foo', 'bar'])
    expect(parseJsonPath('foo.bar.qux')).toEqual(['foo', 'bar', 'qux'])
  })

  it('should parse property names with bracket notation', () => {
    expect(parseJsonPath(String.raw`['a']`)).toEqual(['a'])
    expect(parseJsonPath(String.raw`["a"]`)).toEqual(['a'])
    expect(parseJsonPath(String.raw`['foo']["bar"]`)).toEqual(['foo', 'bar'])
    expect(parseJsonPath(String.raw`['foo']["bar"]['qux']`)).toEqual(['foo', 'bar', 'qux'])
  })

  it('should parse variable and property names mixed', () => {
    expect(parseJsonPath(String.raw`['foo'].bar['qux']`)).toEqual(['foo', 'bar', 'qux'])
  })

  it('should parse array indexes', () => {
    expect(parseJsonPath('[0]')).toEqual(['0'])
    expect(parseJsonPath('foo[12]')).toEqual(['foo', '12'])
    expect(parseJsonPath(String.raw`['foo'][12]`)).toEqual(['foo', '12'])
  })

  it('should parse property names with unsupported variable name characters', () => {
    expect(parseJsonPath(String.raw`['foo\n']`)).toEqual([String.raw`foo\n`])
    expect(parseJsonPath(String.raw`['foo\'']`)).toEqual([String.raw`foo\'`])
    expect(parseJsonPath(String.raw`["foo\""]`)).toEqual([String.raw`foo\"`])
    expect(parseJsonPath(String.raw`['foo[]']`)).toEqual([String.raw`foo[]`])
  })

  it('should return an empty array for an invalid path', () => {
    expect(parseJsonPath('.foo')).toEqual([])
    expect(parseJsonPath('.')).toEqual([])
    expect(parseJsonPath('foo.')).toEqual([])
    expect(parseJsonPath('foo..bar')).toEqual([])
    expect(parseJsonPath('[1')).toEqual([])
    expect(parseJsonPath('foo]')).toEqual([])
    expect(parseJsonPath(String.raw`[['foo']`)).toEqual([])
    expect(parseJsonPath(String.raw`['foo'`)).toEqual([])
    expect(parseJsonPath(String.raw`['foo]`)).toEqual([])
    expect(parseJsonPath(String.raw`[foo']`)).toEqual([])
    expect(parseJsonPath(String.raw`['foo''bar']`)).toEqual([])
    expect(parseJsonPath(String.raw`['foo\o']`)).toEqual([])
    expect(parseJsonPath(String.raw`['foo']a`)).toEqual([])
    expect(parseJsonPath(String.raw`["foo']`)).toEqual([])
  })
})
