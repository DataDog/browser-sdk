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

  describe('default selector', () => {
    describe('ID selector', () => {
      it('should use the ID selector when the element as an ID', () => {
        expect(getDefaultSelector('<div id="foo"></div>')).toBe('#foo')
      })

      it('should not use the ID selector when the ID is not unique', () => {
        expect(getDefaultSelector('<div id="foo"></div><div id="foo"></div>')).not.toContain('#foo')
      })

      it('should not use generated IDs', () => {
        expect(getDefaultSelector('<div id="foo4"></div>')).toBe('BODY>DIV')
      })
    })

    describe('class selector', () => {
      it('should use the class selector when the element as classes', () => {
        expect(getDefaultSelector('<div class="foo"></div>')).toBe('BODY>DIV.foo')
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

      it('should not use the class selector for body elements', () => {
        const element = isolatedDom.append('<div></div>')
        element.ownerDocument.body.classList.add('foo')
        expect(getDefaultSelector(element)).toBe('BODY>DIV')
      })

      it('should not use generated classes', () => {
        expect(getDefaultSelector('<div class="foo4"></div>')).toBe('BODY>DIV')
      })

      it('uses only the first class', () => {
        expect(getDefaultSelector('<div class="foo bar baz baa"></div>')).toBe('BODY>DIV.foo')
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

    describe('attribute selector', () => {
      it('uses a stable attribute if the element has one', () => {
        expect(getDefaultSelector('<div data-testid="foo"></div>')).toBe('DIV[data-testid="foo"]')
      })

      it('escapes the attribute value', () => {
        expect(getDefaultSelector('<div data-testid="&quot;foo bar&quot;"></div>')).toBe(
          'DIV[data-testid="\\"foo\\ bar\\""]'
        )
      })

      it('attribute selector with the custom action name attribute takes precedence over other stable attribute selectors', () => {
        expect(getDefaultSelector('<div action-name="foo" data-testid="bar"></div>', 'action-name')).toBe(
          'DIV[action-name="foo"]'
        )
      })

      it('stable attribute selector should take precedence over class selector', () => {
        expect(getDefaultSelector('<div class="foo" data-testid="foo"></div>')).toBe('DIV[data-testid="foo"]')
      })

      it('stable attribute selector should take precedence over ID selector', () => {
        expect(getDefaultSelector('<div id="foo" data-testid="foo"></div>')).toBe('DIV[data-testid="foo"]')
      })

      it("uses a stable attribute selector and continue recursing if it's not unique globally", () => {
        expect(
          getDefaultSelector(`
            <button target data-testid="foo"></button>

            <div>
              <button data-testid="foo"></button>
            </div>
          `)
        ).toBe('BODY>BUTTON[data-testid="foo"]')
      })
    })

    function getDefaultSelector(htmlOrElement: string | Element, actionNameAttribute?: string): string {
      return getSelectorsFromElement(
        typeof htmlOrElement === 'string' ? isolatedDom.append(htmlOrElement) : htmlOrElement,
        actionNameAttribute
      ).selector
    }
  })
})
