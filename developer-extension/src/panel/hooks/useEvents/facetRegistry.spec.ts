import { getAllFields } from './facetRegistry'

describe('getAllFields', () => {
  it('return a simple field', () => {
    expect(getAllFields({ foo: 'bar' })).toEqual(new Map([['foo', 'bar']]))
  })

  it('return a field with an array as value', () => {
    expect(getAllFields({ foo: ['bar', 'baz'] })).toEqual(new Map([['foo', ['bar', 'baz']]]))
  })

  it('return a nested field', () => {
    expect(getAllFields({ foo: { bar: 'baz' } })).toEqual(new Map([['foo.bar', 'baz']]))
  })

  it('return a fields nested in an array', () => {
    expect(getAllFields({ foo: [{ bar: 'baz' }, { bar: 'biz' }] })).toEqual(new Map([['foo.bar', ['baz', 'biz']]]))
  })
})
