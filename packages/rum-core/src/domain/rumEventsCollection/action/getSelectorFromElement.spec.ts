import { getSelectorFromElement } from './getSelectorFromElement'

describe('getSelectorFromElement', () => {
  const iframes: HTMLIFrameElement[] = []

  function element(s: TemplateStringsArray) {
    // Simply using a DOMParser does not fit here, because script tags created this way are
    // considered as normal markup, so they are not ignored when getting the textual content of the
    // target via innerText

    const iframe = document.createElement('iframe')
    iframes.push(iframe)
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument!
    doc.open()
    doc.write(`<html><body>${s[0]}</body></html>`)
    doc.close()
    return doc.querySelector('[target]') || doc.body.children[0]
  }

  afterEach(() => {
    iframes.forEach((iframe) => iframe.parentNode!.removeChild(iframe))
    iframes.length = 0
  })

  describe('ID selector', () => {
    it('should use the ID selector when the element as an ID', () => {
      expect(getSelectorFromElement(element`<div id="foo"></div>`)).toBe('#foo')
    })

    it('should not use the ID selector when the ID is not unique', () => {
      expect(getSelectorFromElement(element`<div id="foo"></div><div id="foo"></div>`)).not.toContain('#foo')
    })
  })

  describe('class selector', () => {
    it('should use the class selector when the element as classes', () => {
      expect(getSelectorFromElement(element`<div class="foo bar"></div>`)).toBe('BODY>DIV.bar.foo')
    })

    it('should use the class selector when siblings have the same classes but different tags', () => {
      expect(getSelectorFromElement(element`<div target class="foo"></div><span class="foo"></span>`)).toBe(
        'BODY>DIV.foo'
      )
    })

    it('should not use the class selector when siblings have the tag + classes', () => {
      expect(getSelectorFromElement(element`<div target class="foo"></div><div class="foo"></div>`)).not.toContain(
        'DIV.foo'
      )
      expect(
        getSelectorFromElement(element`<div target class="foo bar"></div><div class="bar foo baz"></div>`)
      ).not.toContain('DIV.foo')
    })
  })

  describe('position selector', () => {
    it('should use nth-of-type when the element as siblings', () => {
      const html = element`<div></div><div target></div>`
      expect(getSelectorFromElement(html)).toBe('BODY>DIV:nth-of-type(2)')
    })

    it('should not use nth-of-type when the element has no siblings', () => {
      const html = element`<div></div>`
      expect(getSelectorFromElement(html)).toBe('BODY>DIV')
    })
  })

  describe('strategies priority', () => {
    it('ID selector should take precedence over class selector', () => {
      expect(getSelectorFromElement(element`<div id="foo" class="bar"></div>`)).toBe('#foo')
    })

    it('class selector should take precedence over position selector', () => {
      expect(getSelectorFromElement(element`<div class="bar"></div><div></div>`)).toBe('BODY>DIV.bar')
    })
  })
})
