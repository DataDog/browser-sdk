import { isChromium } from '../../../../../packages/core/src/tools/utils/browserDetection'
import { getAllFields } from './facetRegistry'

describe('getAllFields', () => {
  beforeEach(() => {
    if (!isChromium()) {
      pending('Extension only supported in chromium')
    }
  })

  it('return a simple field', () => {
    expect(getAllFields({ foo: 'bar' })).toEqual(new Map([['foo', 'bar']]))
  })

  it('return a field with an array as value', () => {
    expect(getAllFields({ foo: ['bar', 'baz'] })).toEqual(new Map([['foo', ['bar', 'baz']]]))
  })

  it('return intermediary fields', () => {
    expect(getAllFields({ foo: { bar: 'baz' } })).toEqual(
      new Map<string, unknown>([
        ['foo', { bar: 'baz' }],
        ['foo.bar', 'baz'],
      ])
    )
  })

  it('return fields nested in an array', () => {
    expect(getAllFields({ foo: [{ bar: 'baz' }, { bar: 'biz' }] })).toEqual(
      new Map([
        ['foo', [{ bar: 'baz' }, { bar: 'biz' }]],
        ['foo.bar', ['baz', 'biz']],
      ])
    )
  })
})
