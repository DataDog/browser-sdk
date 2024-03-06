import { isIE } from '@datadog/browser-core'
import { appendElement } from '../../test'
import { getSelectorFromElement, supportScopeSelector } from './getSelectorFromElement'

describe('getSelectorFromElement', () => {
  const noActionNameAttribute = undefined

  afterEach(() => {
    document.body.classList.remove('foo')
  })

  describe('ID selector', () => {
    it('should use the ID selector when the element as an ID', () => {
      expect(getSelectorFromElement(appendElement('<div id="foo"></div>'))).toBe('#foo')
    })

    it('should not use the ID selector when the ID is not unique', () => {
      expect(getSelectorFromElement(appendElement('<div id="foo"></div><div id="foo"></div>'))).not.toContain('#foo')
    })

    it('should not use generated IDs', () => {
      expect(getSelectorFromElement(appendElement('<div id="foo4"></div>'))).toBe('BODY>DIV')
    })
  })

  describe('class selector', () => {
    it('should use the class selector when the element as classes', () => {
      expect(getSelectorFromElement(appendElement('<div class="foo"></div>'))).toBe('BODY>DIV.foo')
    })

    it('should use the class selector when siblings have the same classes but different tags', () => {
      expect(getSelectorFromElement(appendElement('<div target class="foo"></div><span class="foo"></span>'))).toBe(
        'BODY>DIV.foo'
      )
    })

    it('should not use the class selector when siblings have the tag + classes', () => {
      expect(
        getSelectorFromElement(appendElement('<div target class="foo"></div><div class="foo"></div>'))
      ).not.toContain('DIV.foo')
      expect(
        getSelectorFromElement(appendElement('<div target class="foo bar"></div><div class="bar foo baz"></div>'))
      ).not.toContain('DIV.foo')
    })

    it('should not use the class selector for body elements', () => {
      const element = appendElement('<div></div>')
      document.body.classList.add('foo')
      expect(getSelectorFromElement(element)).toBe('BODY>DIV')
    })

    it('should not use generated classes', () => {
      expect(getSelectorFromElement(appendElement('<div class="foo4"></div>'))).toBe('BODY>DIV')
    })

    it('uses only the first class', () => {
      expect(getSelectorFromElement(appendElement('<div class="foo bar baz baa"></div>'))).toBe('BODY>DIV.foo')
    })
  })

  describe('position selector', () => {
    it('should use nth-of-type when the selector matches multiple descendants', () => {
      expect(
        getSelectorFromElement(
          appendElement(`
            <span></span>
            <div><button></button></div>
            <span></span>
            <div><button target></button></div>
          `)
        )
      ).toBe('BODY>DIV:nth-of-type(2)>BUTTON')
    })

    it('should not use nth-of-type when the selector is matching a single descendant', () => {
      expect(
        getSelectorFromElement(
          appendElement(`
          <div></div>
          <div><button target></button></div>
        `)
        )
      ).toBe('BODY>DIV>BUTTON')
    })

    it('should only consider direct descendants (>) of the parent element when checking for unicity', () => {
      expect(
        getSelectorFromElement(
          appendElement(`
          <main>
            <div><div><button></button></div></div>
            <div><button target></button></div>
          </main>
        `)
        )
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
      expect(getSelectorFromElement(appendElement('<div id="foo" class="bar"></div>'))).toBe('#foo')
    })

    it('class selector should take precedence over position selector', () => {
      expect(getSelectorFromElement(appendElement('<div class="bar"></div><div></div>'))).toBe('BODY>DIV.bar')
    })
  })

  describe('should escape CSS selectors', () => {
    it('on ID value', () => {
      expect(getSelectorFromElement(appendElement('<div id="#bar"></div>'))).toBe('#\\#bar')
    })

    it('on attribute value', () => {
      expect(getSelectorFromElement(appendElement('<div data-testid="&quot;foo bar&quot;"></div>'))).toBe(
        'DIV[data-testid="\\"foo\\ bar\\""]'
      )
    })

    it('on class name', () => {
      expect(getSelectorFromElement(appendElement('<div class="#bar"</div>'))).toBe('BODY>DIV.\\#bar')
    })

    it('on tag name', () => {
      expect(getSelectorFromElement(appendElement('<div&nbsp;span>></div&nbsp;span>'))).toBe('BODY>DIV\\&NBSP\\;SPAN')
    })
  })

  describe('attribute selector', () => {
    it('uses a stable attribute if the element has one', () => {
      expect(getSelectorFromElement(appendElement('<div data-testid="foo"></div>'))).toBe('DIV[data-testid="foo"]')
    })

    it('attribute selector with the custom action name attribute takes precedence over other stable attribute selectors', () => {
      expect(
        getSelectorFromElement(appendElement('<div action-name="foo" data-testid="bar"></div>'), 'action-name')
      ).toBe('DIV[action-name="foo"]')
    })

    it('stable attribute selector should take precedence over class selector', () => {
      expect(getSelectorFromElement(appendElement('<div class="foo" data-testid="foo"></div>'))).toBe(
        'DIV[data-testid="foo"]'
      )
    })

    it('stable attribute selector should take precedence over ID selector', () => {
      expect(getSelectorFromElement(appendElement('<div id="foo" data-testid="foo"></div>'))).toBe(
        'DIV[data-testid="foo"]'
      )
    })

    it("uses a stable attribute selector and continue recursing if it's not unique globally", () => {
      expect(
        getSelectorFromElement(
          appendElement(`
            <button target data-testid="foo"></button>

            <div>
              <button data-testid="foo"></button>
            </div>
          `)
        )
      ).toBe(
        supportScopeSelector()
          ? 'BODY>BUTTON[data-testid="foo"]'
          : // Degraded support for browsers not supporting scoped selector: the selector is still
            // correct, but its quality is a bit worse, as using a stable attribute reduce the
            // chances of matching a completely unrelated element.
            'BODY>BUTTON:nth-of-type(1)'
      )
    })
  })

  describe('should target closest meaningful element when targetMeaningfulElement: true', () => {
    beforeEach(() => {
      if (isIE()) {
        pending('IE is not supported')
      }
    })

    it('based on their tags', () => {
      expect(
        getSelectorFromElement(appendElement('<button><span target><span></button>'), noActionNameAttribute, {
          targetMeaningfulElement: true,
        })
      ).toBe('BODY>BUTTON')
      expect(
        getSelectorFromElement(appendElement('<a><span target><span></a>'), noActionNameAttribute, {
          targetMeaningfulElement: true,
        })
      ).toBe('BODY>A')
      expect(
        getSelectorFromElement(appendElement('<select><option target><option></select>'), noActionNameAttribute, {
          targetMeaningfulElement: true,
        })
      ).toBe('BODY>SELECT')
    })

    it('based on their role', () => {
      expect(
        getSelectorFromElement(appendElement('<div role="link"><span target><span></a>'), noActionNameAttribute, {
          targetMeaningfulElement: true,
        })
      ).toBe('BODY>DIV')
    })

    it('based on [aria-label]', () => {
      expect(
        getSelectorFromElement(appendElement('<div aria-label="foo"><span target><span></a>'), noActionNameAttribute, {
          targetMeaningfulElement: true,
        })
      ).toBe('BODY>DIV')
    })

    it('based on [title]', () => {
      expect(
        getSelectorFromElement(appendElement('<div title="foo"><span target><span></a>'), noActionNameAttribute, {
          targetMeaningfulElement: true,
        })
      ).toBe('BODY>DIV')
    })
  })

  it('should stop recurring when unique amongst the page when stopRecurringWhenUnique: true', () => {
    expect(
      getSelectorFromElement(appendElement('<article><button target></button></article>'), noActionNameAttribute, {
        stopRecurringWhenUnique: true,
      })
    ).toBe('BUTTON')
  })

  it('should only prefix with semantic tagName when onlyPrefixWithSemanticTag: true', () => {
    expect(
      getSelectorFromElement(
        appendElement('<article><div class="foo"><button target></button></div></article>'),
        noActionNameAttribute,
        {
          onlyPrefixWithSemanticTag: true,
        }
      )
    ).toBe('BODY>ARTICLE>.foo>BUTTON')
  })
})
