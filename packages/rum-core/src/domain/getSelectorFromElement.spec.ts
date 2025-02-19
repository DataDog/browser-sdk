import { appendElement } from '../../test'
import { getSelectorFromElement, isSelectorUniqueAmongSiblings } from './getSelectorFromElement'

describe('getSelectorFromElement', () => {
  afterEach(() => {
    document.body.classList.remove('foo')
  })

  it('returns undefined for detached elements', () => {
    const element = document.createElement('div')
    expect(getSelector(element)).toBeUndefined()
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
      expect(getSelector('<div target class="foo"></div>')).toBe('BODY>DIV.foo')
    })

    it('should use the class selector when siblings have the same classes but different tags', () => {
      expect(getSelector('<div target class="foo"></div><span class="foo"></span>')).toBe('BODY>DIV.foo')
    })

    it('should not use the class selector when siblings have the tag + classes', () => {
      expect(getSelector('<div target class="foo"></div><div class="foo"></div>')).not.toContain('DIV.foo')
      expect(getSelector('<div target class="foo bar"></div><div class="bar foo baz"></div>')).not.toContain('DIV.foo')
    })

    it('should not use the class selector for body elements', () => {
      const element = appendElement('<div></div>')
      document.body.classList.add('foo')
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
      ).toBe('BODY>MAIN>DIV>BUTTON')
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
    it('on ID value', () => {
      expect(getSelector('<div id="#bar"></div>')).toBe('#\\#bar')
    })

    it('on attribute value', () => {
      expect(getSelector('<div data-testid="&quot;foo bar&quot;"></div>')).toBe('DIV[data-testid="\\"foo\\ bar\\""]')
    })

    it('on class name', () => {
      expect(getSelector('<div class="#bar"</div>')).toBe('BODY>DIV.\\#bar')
    })

    it('on tag name', () => {
      expect(getSelector('<div&nbsp;span>></div&nbsp;span>')).toBe('BODY>DIV\\&NBSP\\;SPAN')
    })
  })

  describe('attribute selector', () => {
    it('uses a stable attribute if the element has one', () => {
      expect(getSelector('<div data-testid="foo"></div>')).toBe('DIV[data-testid="foo"]')
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
      ).toBe('BODY>BUTTON[data-testid="foo"]')
    })
  })

  it('should compute a CSS selector on SVG elements', () => {
    const element = appendElement('<svg class="foo"></svg>')
    expect(getSelector(element)).toBe('BODY>svg.foo')
  })

  function getSelector(htmlOrElement: string | Element, actionNameAttribute?: string): string | undefined {
    return getSelectorFromElement(
      typeof htmlOrElement === 'string' ? appendElement(htmlOrElement) : htmlOrElement,
      actionNameAttribute
    )
  }
})

describe('isSelectorUniqueAmongSiblings', () => {
  it('returns true when the element is alone', () => {
    const element = appendElement('<div></div>')
    expect(isSelectorUniqueAmongSiblings(element, 'DIV', undefined)).toBeTrue()
  })

  it('returns false when a sibling element matches the element selector', () => {
    const element = appendElement(`
      <div target></div>
      <div></div>
    `)
    expect(isSelectorUniqueAmongSiblings(element, 'DIV', undefined)).toBeFalse()
  })

  it('returns true when the element selector does not match any sibling', () => {
    const element = appendElement(`
      <div target></div>
      <span></span>
    `)
    expect(isSelectorUniqueAmongSiblings(element, 'DIV', undefined)).toBeTrue()
  })

  it('returns false when the child selector matches an element in a sibling', () => {
    const element = appendElement(`
      <div target>
        <hr>
      </div>
      <div>
        <hr>
      </div>
    `)
    expect(isSelectorUniqueAmongSiblings(element, 'DIV', 'HR')).toBeFalse()
  })

  it('returns true when the current element selector does not match the sibling', () => {
    const element = appendElement(`
      <div target>
        <hr>
      </div>
      <h1>
        <hr>
      </h1>
    `)
    expect(isSelectorUniqueAmongSiblings(element, 'DIV', 'HR')).toBeTrue()
  })

  it('the selector should not consider elements deep in the tree', () => {
    const element = appendElement(`
      <div target>
        <hr>
      </div>
      <h1>
        <div>
          <hr>
        </div>
      </h1>
    `)
    expect(isSelectorUniqueAmongSiblings(element, 'DIV', 'HR')).toBeTrue()
  })
})
