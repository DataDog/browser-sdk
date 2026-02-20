import { appendElement } from '../../test'
import { getSelectorFromElement, isSelectorUniqueAmongSiblings, SHADOW_DOM_MARKER } from './getSelectorFromElement'

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
    expect(isSelectorUniqueAmongSiblings(element, document, 'DIV', undefined)).toBeTrue()
  })

  it('returns false when a sibling element matches the element selector', () => {
    const element = appendElement(`
      <div target></div>
      <div></div>
    `)
    expect(isSelectorUniqueAmongSiblings(element, document, 'DIV', undefined)).toBeFalse()
  })

  it('returns true when the element selector does not match any sibling', () => {
    const element = appendElement(`
      <div target></div>
      <span></span>
    `)
    expect(isSelectorUniqueAmongSiblings(element, document, 'DIV', undefined)).toBeTrue()
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
    expect(isSelectorUniqueAmongSiblings(element, document, 'DIV', 'HR')).toBeFalse()
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
    expect(isSelectorUniqueAmongSiblings(element, document, 'DIV', 'HR')).toBeTrue()
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
    expect(isSelectorUniqueAmongSiblings(element, document, 'DIV', 'HR')).toBeTrue()
  })
})

describe('getSelectorFromElement with shadow DOM', () => {
  it('should generate selector with shadow marker for element inside shadow DOM', () => {
    const host = appendElement('<div id="shadow-host"></div>')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    const button = document.createElement('button')
    button.classList.add('shadow-button')
    shadowRoot.appendChild(button)

    const selector = getSelectorFromElement(button, undefined)
    expect(selector).toBe(`#shadow-host${SHADOW_DOM_MARKER}BUTTON.shadow-button`)
  })

  it('should use stable attribute for element inside shadow DOM with shadow marker', () => {
    const host = appendElement('<div></div>')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    const button = document.createElement('button')
    button.setAttribute('data-testid', 'shadow-test')
    shadowRoot.appendChild(button)

    const selector = getSelectorFromElement(button, undefined)
    expect(selector).toBe(`BODY>DIV${SHADOW_DOM_MARKER}BUTTON[data-testid="shadow-test"]`)
  })

  it('should insert shadow marker when traversing shadow boundary', () => {
    const host = appendElement('<div id="my-host"></div>')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    const button = document.createElement('button')
    shadowRoot.appendChild(button)

    const selector = getSelectorFromElement(button, undefined)
    expect(selector).toBe(`#my-host${SHADOW_DOM_MARKER}BUTTON`)
  })

  it('should handle nested shadow DOMs with multiple markers', () => {
    const outerHost = appendElement('<div data-testid="outer-host"></div>')
    const outerShadowRoot = outerHost.attachShadow({ mode: 'open' })

    const innerHost = document.createElement('div')
    innerHost.setAttribute('data-testid', 'inner-host')
    outerShadowRoot.appendChild(innerHost)
    const innerShadowRoot = innerHost.attachShadow({ mode: 'open' })

    const button = document.createElement('button')
    button.setAttribute('data-testid', 'deep-button')
    innerShadowRoot.appendChild(button)

    const selector = getSelectorFromElement(button, undefined)
    expect(selector).toBe(
      `DIV[data-testid="outer-host"]${SHADOW_DOM_MARKER}DIV[data-testid="inner-host"]${SHADOW_DOM_MARKER}BUTTON[data-testid="deep-button"]`
    )
  })

  it('should use position selector inside shadow DOM with shadow marker', () => {
    const host = appendElement('<div></div>')
    const shadowRoot = host.attachShadow({ mode: 'open' })

    const div1 = document.createElement('div')
    const span1 = document.createElement('span')
    div1.appendChild(span1)

    const div2 = document.createElement('div')
    const target = document.createElement('span')
    div2.appendChild(target)

    shadowRoot.appendChild(div1)
    shadowRoot.appendChild(div2)

    const selector = getSelectorFromElement(target, undefined)
    // Both divs have a span, so DIV>SPAN is not unique, need nth-of-type
    expect(selector).toBe(`BODY>DIV${SHADOW_DOM_MARKER}DIV:nth-of-type(2)>SPAN`)
  })

  it('should generate unique selector when siblings exist inside shadow DOM', () => {
    const host = appendElement('<div id="host"></div>')
    const shadowRoot = host.attachShadow({ mode: 'open' })

    const button1 = document.createElement('button')
    button1.classList.add('first')
    const button2 = document.createElement('button')
    button2.classList.add('second')

    shadowRoot.appendChild(button1)
    shadowRoot.appendChild(button2)

    const selector1 = getSelectorFromElement(button1, undefined)
    const selector2 = getSelectorFromElement(button2, undefined)

    expect(selector1).toBe(`#host${SHADOW_DOM_MARKER}BUTTON.first`)
    expect(selector2).toBe(`#host${SHADOW_DOM_MARKER}BUTTON.second`)
  })

  it('should NOT add shadow marker for elements in light DOM', () => {
    const element = appendElement('<div><button class="light-btn"></button></div>')
    const button = element.querySelector('button')!

    const selector = getSelectorFromElement(button, undefined)
    expect(selector).toBe('BODY>DIV>BUTTON.light-btn')
  })

  it('should generate DIFFERENT selectors for buttons in two identical shadow hosts', () => {
    const container = appendElement('<div id="test-container"></div>')

    const host1 = document.createElement('my-button')
    const host2 = document.createElement('my-button')
    container.appendChild(host1)
    container.appendChild(host2)

    const shadow1 = host1.attachShadow({ mode: 'open' })
    const shadow2 = host2.attachShadow({ mode: 'open' })

    const button1 = document.createElement('button')
    button1.textContent = 'Button 1'
    shadow1.appendChild(button1)

    const button2 = document.createElement('button')
    button2.textContent = 'Button 2'
    shadow2.appendChild(button2)

    const selector1 = getSelectorFromElement(button1, undefined)
    const selector2 = getSelectorFromElement(button2, undefined)

    expect(selector1).toBe(`#test-container>MY-BUTTON:nth-of-type(1)${SHADOW_DOM_MARKER}BUTTON`)
    expect(selector2).toBe(`#test-container>MY-BUTTON:nth-of-type(2)${SHADOW_DOM_MARKER}BUTTON`)
  })

  it('should handle duplicated IDs between light DOM and shadow DOM', () => {
    const host = appendElement('<div id="foo"></div>')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    const button = document.createElement('button')
    button.id = 'foo'
    shadowRoot.appendChild(button)

    const selector = getSelectorFromElement(button, undefined)
    expect(selector).toBe(`#foo${SHADOW_DOM_MARKER}#foo`)
  })

  it('returns false when element is in DocumentFragment with matching siblings', () => {
    const fragment = document.createDocumentFragment()
    const div1 = document.createElement('div')
    const div2 = document.createElement('div')
    fragment.appendChild(div1)
    fragment.appendChild(div2)

    // The function should return false because div2 matches 'DIV' selector
    expect(isSelectorUniqueAmongSiblings(div1, document, 'DIV', undefined)).toBeFalse()
  })

  it('returns true when element is in DocumentFragment with no matching siblings', () => {
    const fragment = document.createDocumentFragment()
    const div = document.createElement('div')
    fragment.appendChild(div)

    expect(isSelectorUniqueAmongSiblings(div, document, 'DIV', undefined)).toBeTrue()
  })
})
