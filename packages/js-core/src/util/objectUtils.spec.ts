import { tryJsonParse } from './objectUtils'

describe('tryJsonParse', () => {
  it('should parse valid JSON', () => {
    expect(tryJsonParse('{"a":1}')).toEqual({ a: 1 })
  })

  it('should return undefined for invalid JSON', () => {
    expect(tryJsonParse('not json')).toBeUndefined()
  })

  it('should strip __proto__ key', () => {
    const result = tryJsonParse('{"a":1,"__proto__":{"injected":true}}')
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBeFalse()
    expect(({} as any).injected).toBeUndefined()
  })

  it('should strip nested __proto__ key', () => {
    tryJsonParse('{"a":{"__proto__":{"injected":true}}}')
    expect(({} as any).injected).toBeUndefined()
  })
})
