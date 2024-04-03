import { appendElement } from '../../test'
import { cssEscape, elementMatches, getClassList, getParentElement } from './polyfills'

describe('cssEscape', () => {
  it('should escape a string', () => {
    expect(cssEscape('.foo#bar')).toEqual('\\.foo\\#bar')
    expect(cssEscape('()[]{}')).toEqual('\\(\\)\\[\\]\\{\\}')
    expect(cssEscape('--a')).toEqual('--a')
    expect(cssEscape('\0')).toEqual('\ufffd')
  })
})

describe('elementMatches', () => {
  it('should return true if the element matches the selector', () => {
    const element = document.createElement('div')
    element.classList.add('foo')
    expect(elementMatches(element, '.foo')).toEqual(true)
  })

  it('should return false if the element does not match the selector', () => {
    const element = document.createElement('div')
    element.classList.add('bar')
    expect(elementMatches(element, '.foo')).toEqual(false)
  })
})

describe('getParentElement', () => {
  it('should return the parentElement of a element that supports the parentElement property', () => {
    const divElement = appendElement('<div class="parent"><div target></div></div>')
    const parenElement = getParentElement(divElement)
    expect(parenElement?.className).toEqual('parent')
  })

  it('should return the parentElement of a element that does not support the parentElement property (e.g.: svg on IE)', () => {
    const svgElement = appendElement('<div class="parent"><svg target></svg></div>')
    Object.defineProperty(svgElement, 'parenElement', { get: () => undefined })
    const parenElement = getParentElement(svgElement)
    expect(parenElement?.className).toEqual('parent')
  })

  it('should return null on the top most element', () => {
    const html = document.querySelector('html')!
    Object.defineProperty(html, 'parenElement', { get: () => undefined })
    const parenElement = getParentElement(html)
    expect(parenElement).toEqual(null)
  })
})

describe('getClassList', () => {
  it('should return the classList of an element that supports the classList property', () => {
    const divElement = appendElement('<div class="foo bar"></div>')
    const classList = getClassList(divElement)
    expect(classList[0]).toEqual('foo')
    expect(classList[1]).toEqual('bar')
  })

  it('should return the classList of an element that does not support the classList property (e.g.: svg on IE)', () => {
    const svgElement = appendElement('<svg class="foo bar"></svg>')
    Object.defineProperty(svgElement, 'classList', { get: () => undefined })
    const classList = getClassList(svgElement)
    expect(classList[0]).toEqual('foo')
    expect(classList[1]).toEqual('bar')
  })
})
