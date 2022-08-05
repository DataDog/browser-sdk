import type { IsolatedDom } from '../../../../test/createIsolatedDom'
import { createIsolatedDom } from '../../../../test/createIsolatedDom'
import { getSelectorsFromElement } from './getSelectorsFromElement'

describe('getSelectorFromElement', () => {
  let isolatedDom: IsolatedDom

  beforeEach(() => {
    isolatedDom = createIsolatedDom()
  })

  afterEach(() => {
    isolatedDom.clear()
  })

  describe('ID selector', () => {
    it('should use the ID selector when the element as an ID', () => {
      expect(getDefaultSelector('<div id="foo"></div>')).toBe('#foo')
    })

    it('should not use the ID selector when the ID is not unique', () => {
      expect(getDefaultSelector('<div id="foo"></div><div id="foo"></div>')).not.toContain('#foo')
    })
  })

  describe('class selector', () => {
    it('should use the class selector when the element as classes', () => {
      expect(getDefaultSelector('<div class="foo bar"></div>')).toBe('BODY>DIV.bar.foo')
    })

    it('should use the class selector when siblings have the same classes but different tags', () => {
      expect(getDefaultSelector('<div target class="foo"></div><span class="foo"></span>')).toBe('BODY>DIV.foo')
    })

    it('should not use the class selector when siblings have the tag + classes', () => {
      expect(getDefaultSelector('<div target class="foo"></div><div class="foo"></div>')).not.toContain('DIV.foo')
      expect(getDefaultSelector('<div target class="foo bar"></div><div class="bar foo baz"></div>')).not.toContain(
        'DIV.foo'
      )
    })
  })

  describe('position selector', () => {
    it('should use nth-of-type when the element as siblings', () => {
      expect(getDefaultSelector('<span></span><div></div><span></span><div target></div>')).toBe(
        'BODY>DIV:nth-of-type(2)'
      )
    })

    it('should not use nth-of-type when the element has no siblings', () => {
      expect(getDefaultSelector('<div></div>')).toBe('BODY>DIV')
    })
  })

  describe('strategies priority', () => {
    it('ID selector should take precedence over class selector', () => {
      expect(getDefaultSelector('<div id="foo" class="bar"></div>')).toBe('#foo')
    })

    it('class selector should take precedence over position selector', () => {
      expect(getDefaultSelector('<div class="bar"></div><div></div>')).toBe('BODY>DIV.bar')
    })
  })

  describe('should escape CSS selectors', () => {
    it('ID selector should take precedence over class selector', () => {
      expect(getDefaultSelector('<div id="#bar"><button target class=".foo"></button></div>')).toBe(
        '#\\#bar>BUTTON.\\.foo'
      )
    })
  })

  function getDefaultSelector(html: string): string {
    return getSelectorsFromElement(isolatedDom.append(html)).selector
  }
})
