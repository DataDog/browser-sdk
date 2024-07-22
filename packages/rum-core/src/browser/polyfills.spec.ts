import { appendElement } from '../../test'
import { getClassList } from './polyfills'

describe('getClassList', () => {
  it('should return the classList of an element that supports the classList property', () => {
    const divElement = appendElement('<div class="foo bar"></div>')
    const classList = getClassList(divElement)
    expect(classList[0]).toEqual('foo')
    expect(classList[1]).toEqual('bar')
  })

  it('should return the classList of an element that does not support the classList property (e.g.: svg on Opera Mini)', () => {
    const svgElement = appendElement('<svg class="foo bar"></svg>')
    Object.defineProperty(svgElement, 'classList', { get: () => undefined })
    const classList = getClassList(svgElement)
    expect(classList[0]).toEqual('foo')
    expect(classList[1]).toEqual('bar')
  })
})
