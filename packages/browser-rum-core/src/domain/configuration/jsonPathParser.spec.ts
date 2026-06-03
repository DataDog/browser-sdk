import { parseJsonPath } from './jsonPathParser'

describe('parseJsonPath', () => {
  it('should extract selectors from dot notation', () => {
    expect(parseJsonPath('a')).toEqual(['a'])
    expect(parseJsonPath('foo.bar')).toEqual(['foo', 'bar'])
    expect(parseJsonPath('foo.bar.qux')).toEqual(['foo', 'bar', 'qux'])
  })

  it('should parse extract selectors from bracket notation', () => {
    expect(parseJsonPath(String.raw`['a']`)).toEqual(['a'])
    expect(parseJsonPath(String.raw`["a"]`)).toEqual(['a'])
    expect(parseJsonPath(String.raw`['foo']["bar"]`)).toEqual(['foo', 'bar'])
    expect(parseJsonPath(String.raw`['foo']["bar"]['qux']`)).toEqual(['foo', 'bar', 'qux'])
  })

  it('should extract selectors from mixed notations', () => {
    expect(parseJsonPath(String.raw`['foo'].bar['qux']`)).toEqual(['foo', 'bar', 'qux'])
  })

  it('should extract name and index selectors', () => {
    expect(parseJsonPath('[0]')).toEqual(['0'])
    expect(parseJsonPath('foo[12]')).toEqual(['foo', '12'])
    expect(parseJsonPath(String.raw`['foo'][12]`)).toEqual(['foo', '12'])
  })

  it('should extract name selectors replacing escaped sequence by equivalent character', () => {
    expect(parseJsonPath(String.raw`['foo\n']`)).toEqual(['foo\n'])
    expect(parseJsonPath(String.raw`['foo\b']`)).toEqual(['foo\b'])
    expect(parseJsonPath(String.raw`['foo\t']`)).toEqual(['foo\t'])
    expect(parseJsonPath(String.raw`['foo\f']`)).toEqual(['foo\f'])
    expect(parseJsonPath(String.raw`['foo\r']`)).toEqual(['foo\r'])
    expect(parseJsonPath(String.raw`["foo\u03A9"]`)).toEqual(['fooΩ'])
    expect(parseJsonPath(String.raw`["\u03A9A"]`)).toEqual(['ΩA'])
    expect(parseJsonPath(String.raw`["\t\u03A9\n"]`)).toEqual(['\tΩ\n'])
    expect(parseJsonPath(String.raw`['foo\'']`)).toEqual([String.raw`foo'`])
    expect(parseJsonPath(String.raw`["foo\""]`)).toEqual([String.raw`foo"`])
    expect(parseJsonPath(String.raw`["foo\/"]`)).toEqual([String.raw`foo/`])
  })

  it('should extract name selectors containing characters not supported in name shorthands', () => {
    expect(parseJsonPath(String.raw`['foo[]']`)).toEqual([String.raw`foo[]`])
    expect(parseJsonPath(String.raw`['foo.']`)).toEqual([String.raw`foo.`])
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
    expect(parseJsonPath(String.raw`["\u03Z9"]`)).toEqual([])
    expect(parseJsonPath(String.raw`['foo\u12']`)).toEqual([])
    expect(parseJsonPath(String.raw`['foo']a`)).toEqual([])
    expect(parseJsonPath(String.raw`["foo']`)).toEqual([])
  })
})
