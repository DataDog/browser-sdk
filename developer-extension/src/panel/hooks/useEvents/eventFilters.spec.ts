import { parseQuery } from './eventFilters'

describe('parseQuery', () => {
  it('return a simple field', () => {
    expect(parseQuery('foo:bar')).toEqual([['foo', 'bar']])
  })
  it('return intermediary fields', () => {
    expect(parseQuery('foo.bar:baz')).toEqual([['foo.bar', 'baz']])
  })
  it('return multiple fields', () => {
    expect(parseQuery('foo:bar baz:qux')).toEqual([
      ['foo', 'bar'],
      ['baz', 'qux'],
    ])
  })
  it('parse escaped whitespace with backslashes in search terms', () => {
    expect(parseQuery('foo:bar\\ baz')).toEqual([['foo', 'bar\\ baz']])
  })
  it('parse escaped whitespace with backslashes in keys', () => {
    expect(parseQuery('foo\\ bar:baz')).toEqual([['foo\\ bar', 'baz']])
  })
  it('return multiple fields with escaped whitespace', () => {
    expect(parseQuery('foo\\ bar:baz\\ qux')).toEqual([['foo\\ bar', 'baz\\ qux']])
    expect(parseQuery('foo:bar\\ baz qux:quux\\ corge')).toEqual([
      ['foo', 'bar\\ baz'],
      ['qux', 'quux\\ corge'],
    ])
  })
})
