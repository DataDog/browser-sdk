import type { IsolatedDom } from '../../../../test/createIsolatedDom'
import { createIsolatedDom } from '../../../../test/createIsolatedDom'
import { getSelectorFromElement, supportScopeSelector } from './getSelectorFromElement'

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
      expect(getSelector('<div id="foo"></div>')).toBe('#foo')
    })

    it('should not use the ID selector when the ID is not unique', () => {
      expect(getSelector('<div id="foo"></div><div id="foo"></div>')).not.toContain('#foo')
    })

    it('should not use generated IDs', () => {
      expect(getSelector('<div id="foo4"></div>')).toBe('BODY>DIV')
    })
  })

  describe('class selector', () => {
    it('should use the class selector when the element as classes', () => {
      expect(getSelector('<div class="foo"></div>')).toBe('BODY>DIV.foo')
    })

    it('should use the class selector when siblings have the same classes but different tags', () => {
      expect(getSelector('<div target class="foo"></div><span class="foo"></span>')).toBe('BODY>DIV.foo')
    })

    it('should not use the class selector when siblings have the tag + classes', () => {
      expect(getSelector('<div target class="foo"></div><div class="foo"></div>')).not.toContain('DIV.foo')
      expect(getSelector('<div target class="foo bar"></div><div class="bar foo baz"></div>')).not.toContain('DIV.foo')
    })

    it('should not use the class selector for body elements', () => {
      const element = isolatedDom.append('<div></div>')
      element.ownerDocument.body.classList.add('foo')
      expect(getSelector(element)).toBe('BODY>DIV')
    })

    it('should not use generated classes', () => {
      expect(getSelector('<div class="foo4"></div>')).toBe('BODY>DIV')
    })

    it('uses only the first class', () => {
      expect(getSelector('<div class="foo bar baz baa"></div>')).toBe('BODY>DIV.foo')
    })
  })

  describe('position selector', () => {
    it('should use nth-of-type when the selector matches multiple descendants', () => {
      expect(
        getSelector(`
            <span></span>
            <div><button></button></div>
            <span></span>
            <div><button target></button></div>
          `)
      ).toBe('BODY>DIV:nth-of-type(2)>BUTTON')
    })

    it('should not use nth-of-type when the selector is matching a single descendant', () => {
      expect(
        getSelector(`
          <div></div>
          <div><button target></button></div>
        `)
      ).toBe('BODY>DIV>BUTTON')
    })

    it('should only consider direct descendants (>) of the parent element when checking for unicity', () => {
      expect(
        getSelector(`
          <main>
            <div><div><button></button></div></div>
            <div><button target></button></div>
          </main>
        `)
      ).toBe(
        supportScopeSelector()
          ? 'BODY>MAIN>DIV>BUTTON'
          : // Degraded support for browsers not supporting scoped selector: the selector is still
            // correct, but its quality is a bit worse, as using a `nth-of-type` selector is a bit
            // too specific and might not match if an element is conditionally inserted before the
            // target.
            'BODY>MAIN>DIV:nth-of-type(2)>BUTTON'
      )
    })
  })

  describe('strategies priority', () => {
    it('ID selector should take precedence over class selector', () => {
      expect(getSelector('<div id="foo" class="bar"></div>')).toBe('#foo')
    })

    it('class selector should take precedence over position selector', () => {
      expect(getSelector('<div class="bar"></div><div></div>')).toBe('BODY>DIV.bar')
    })
  })

  describe('should escape CSS selectors', () => {
    it('ID selector should take precedence over class selector', () => {
      expect(getSelector('<div id="#bar"><button target class=".foo"></button></div>')).toBe('#\\#bar>BUTTON.\\.foo')
    })
  })

  describe('attribute selector', () => {
    it('uses a stable attribute if the element has one', () => {
      expect(getSelector('<div data-testid="foo"></div>')).toBe('DIV[data-testid="foo"]')
    })

    it('escapes the attribute value', () => {
      expect(getSelector('<div data-testid="&quot;foo bar&quot;"></div>')).toBe('DIV[data-testid="\\"foo\\ bar\\""]')
    })

    it('attribute selector with the custom action name attribute takes precedence over other stable attribute selectors', () => {
      expect(getSelector('<div action-name="foo" data-testid="bar"></div>', 'action-name')).toBe(
        'DIV[action-name="foo"]'
      )
    })

    it('stable attribute selector should take precedence over class selector', () => {
      expect(getSelector('<div class="foo" data-testid="foo"></div>')).toBe('DIV[data-testid="foo"]')
    })

    it('stable attribute selector should take precedence over ID selector', () => {
      expect(getSelector('<div id="foo" data-testid="foo"></div>')).toBe('DIV[data-testid="foo"]')
    })

    it("uses a stable attribute selector and continue recursing if it's not unique globally", () => {
      expect(
        getSelector(`
            <button target data-testid="foo"></button>

            <div>
              <button data-testid="foo"></button>
            </div>
          `)
      ).toBe(
        supportScopeSelector()
          ? 'BODY>BUTTON[data-testid="foo"]'
          : // Degraded support for browsers not supporting scoped selector: the selector is still
            // correct, but its quality is a bit worse, as using a stable attribute reduce the
            // chances of matching a completely unrelated element.
            'BODY>BUTTON'
      )
    })
  })

  function getSelector(htmlOrElement: string | Element, actionNameAttribute?: string): string {
    return getSelectorFromElement(
      typeof htmlOrElement === 'string' ? isolatedDom.append(htmlOrElement) : htmlOrElement,
      actionNameAttribute
    )
  }
})
