import { getActionNameFromElement } from './getActionNameFromElement'

describe('getActionNameFromElement', () => {
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

  it('extracts the textual content of an element', () => {
    expect(getActionNameFromElement(element`<div>Foo <div>bar</div></div>`)).toBe('Foo bar')
  })

  it('extracts the text of an input button', () => {
    expect(getActionNameFromElement(element`<input type="button" value="Click" />`)).toBe('Click')
  })

  it('extracts the alt text of an image', () => {
    expect(getActionNameFromElement(element`<img title="foo" alt="bar" />`)).toBe('bar')
  })

  it('extracts the title text of an image', () => {
    expect(getActionNameFromElement(element`<img title="foo" />`)).toBe('foo')
  })

  it('extracts the text of an aria-label attribute', () => {
    expect(getActionNameFromElement(element`<span aria-label="Foo" />`)).toBe('Foo')
  })

  it('gets the parent element textual content if everything else fails', () => {
    expect(getActionNameFromElement(element`<div>Foo <img target /></div>`)).toBe('Foo')
  })

  it("doesn't get the value of a text input", () => {
    expect(getActionNameFromElement(element`<input type="text" value="foo" />`)).toBe('')
  })

  it("doesn't get the value of a password input", () => {
    expect(getActionNameFromElement(element`<input type="password" value="foo" />`)).toBe('')
  })

  it('limits the name length to a reasonable size', () => {
    expect(
      getActionNameFromElement(
        // eslint-disable-next-line  max-len
        element`<div>Foooooooooooooooooo baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaar baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaz</div>`
      )
    ).toBe(
      // eslint-disable-next-line  max-len
      'Foooooooooooooooooo baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa [...]'
    )
  })

  it('normalize white spaces', () => {
    expect(getActionNameFromElement(element`<div>foo\tbar\n\n  baz</div>`)).toBe('foo bar baz')
  })

  it('ignores the inline script textual content', () => {
    expect(getActionNameFromElement(element`<div><script>console.log('toto')</script>b</div>`)).toBe('b')
  })

  it('extracts text from SVG elements', () => {
    expect(getActionNameFromElement(element`<svg><text>foo  bar</text></svg>`)).toBe('foo bar')
  })

  it('extracts text from an associated label', () => {
    expect(
      getActionNameFromElement(element`
        <div>
          <label for="toto">label text</label>
          <div>ignored</div>
          <input id="toto" target />
        </div>
      `)
    ).toBe('label text')
  })

  it('extracts text from a parent label', () => {
    expect(
      getActionNameFromElement(element`
        <label>
          foo
          <div>
            bar
            <input target />
          </div>
        </label>
      `)
    ).toBe('foo bar')
  })

  it('extracts text from the first OPTION element when clicking on a SELECT', () => {
    expect(
      getActionNameFromElement(element`
        <select>
          <option>foo</option>
          <option>bar</option>
        </select>
      `)
    ).toBe('foo')
  })

  it('extracts text from a aria-labelledby associated element', () => {
    expect(
      getActionNameFromElement(element`
        <div>
          <label id="toto">label text</label>
          <div>ignored</div>
          <input aria-labelledby="toto" target />
        </div>
      `)
    ).toBe('label text')
  })

  it('extracts text from multiple aria-labelledby associated elements', () => {
    expect(
      getActionNameFromElement(element`
        <div>
          <label id="toto1">label</label>
          <div>ignored</div>
          <input aria-labelledby="toto1 toto2" target />
          <div>ignored</div>
          <label id="toto2">text</label>
        </div>
      `)
    ).toBe('label text')
  })

  it('extracts text from a BUTTON element', () => {
    expect(
      getActionNameFromElement(element`
        <div>
          <div>ignored</div>
          <button target>foo</button>
        </div>
      `)
    ).toBe('foo')
  })

  it('extracts text from a role=button element', () => {
    expect(
      getActionNameFromElement(element`
        <div>
          <div>ignored</div>
          <div role="button" target>foo</div>
        </div>
      `)
    ).toBe('foo')
  })

  it('limits the recursion to the 10th parent', () => {
    expect(
      getActionNameFromElement(element`
        <div>
          <div>ignored</div>
          <i><i><i><i><i><i><i><i><i><i>
            <i target></i>
          </i></i></i></i></i></i></i></i></i></i>
        </div>
      `)
    ).toBe('')
  })

  it('limits the recursion to the BODY element', () => {
    expect(
      getActionNameFromElement(element`
        <div>ignored</div>
        <i target></i>
      `)
    ).toBe('')
  })

  it('limits the recursion to a FORM element', () => {
    expect(
      getActionNameFromElement(element`
        <div>
          <div>ignored</div>
          <form>
            <i target></i>
          </form>
        </div>
      `)
    ).toBe('')
  })

  it('extracts the name from a parent FORM element', () => {
    expect(
      getActionNameFromElement(element`
        <div>
          <div>ignored</div>
          <form title="foo">
            <i target></i>
          </form>
        </div>
      `)
    ).toBe('foo')
  })

  it('extracts the whole textual content of a button', () => {
    expect(
      getActionNameFromElement(element`
        <button>
          foo
          <i target>bar</i>
        </button>
      `)
    ).toBe('foo bar')
  })

  it('ignores the textual content of contenteditable elements', () => {
    expect(
      getActionNameFromElement(element`
        <div contenteditable>
          <i target>ignored</i>
          ignored
        </div>
      `)
    ).toBe('')
  })

  it('extracts the name from attributes of contenteditable elements', () => {
    expect(
      getActionNameFromElement(element`
        <div contenteditable>
          <i aria-label="foo" target>ignored</i>
          ignored
        </div>
      `)
    ).toBe('foo')
  })

  describe('programmatically declared action name', () => {
    it('extracts the name from the data-dd-action-name attribute', () => {
      expect(
        getActionNameFromElement(element`
          <div data-dd-action-name="foo">ignored</div>
        `)
      ).toBe('foo')
    })

    it('considers any parent', () => {
      const target = element`
        <form>
          <i><i><i><i><i><i><i><i><i><i><i><i>
            <span target>ignored</span>
          </i></i></i></i></i></i></i></i></i></i></i></i>
        </form>
      `
      // Set the attribute on the <HTML> element
      target.ownerDocument.documentElement.setAttribute('data-dd-action-name', 'foo')
      expect(getActionNameFromElement(target)).toBe('foo')
    })

    it('normalizes the value', () => {
      expect(
        getActionNameFromElement(element`
          <div data-dd-action-name="   foo  \t bar  ">ignored</div>
        `)
      ).toBe('foo bar')
    })

    it('fallback on an automatic strategy if the attribute is empty', () => {
      expect(
        getActionNameFromElement(element`
          <div data-dd-action-name="ignored">
            <div data-dd-action-name="">
              <span target>foo</span>
            </div>
          </div>
      `)
      ).toBe('foo')
    })

    it('extracts the name from a user-configured attribute', () => {
      expect(
        getActionNameFromElement(
          element`
          <div data-test-id="foo">ignored</div>
        `,
          'data-test-id'
        )
      ).toBe('foo')
    })

    it('favors data-dd-action-name over user-configured attribute', () => {
      expect(
        getActionNameFromElement(
          element`
          <div data-test-id="foo" data-dd-action-name="bar">ignored</div>
        `,
          'data-test-id'
        )
      ).toBe('bar')
    })
  })
})
