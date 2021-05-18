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
    expect(getActionNameFromElement(element`<div>Foo <div>bar</div></div>`)).toEqual(['Foo bar', 'inferred'])
  })

  it('extracts the text of an input button', () => {
    expect(getActionNameFromElement(element`<input type="button" value="Click" />`)).toEqual(['Click', 'inferred'])
  })

  it('extracts the alt text of an image', () => {
    expect(getActionNameFromElement(element`<img title="foo" alt="bar" />`)).toEqual(['bar', 'inferred'])
  })

  it('extracts the title text of an image', () => {
    expect(getActionNameFromElement(element`<img title="foo" />`)).toEqual(['foo', 'inferred'])
  })

  it('extracts the text of an aria-label attribute', () => {
    expect(getActionNameFromElement(element`<span aria-label="Foo" />`)).toEqual(['Foo', 'inferred'])
  })

  it('gets the parent element textual content if everything else fails', () => {
    expect(getActionNameFromElement(element`<div>Foo <img target /></div>`)).toEqual(['Foo', 'inferred'])
  })

  it("doesn't get the value of a text input", () => {
    expect(getActionNameFromElement(element`<input type="text" value="foo" />`)).toEqual(['', 'inferred'])
  })

  it("doesn't get the value of a password input", () => {
    expect(getActionNameFromElement(element`<input type="password" value="foo" />`)).toEqual(['', 'inferred'])
  })

  it('limits the name length to a reasonable size', () => {
    expect(
      getActionNameFromElement(
        // eslint-disable-next-line  max-len
        element`<div>Foooooooooooooooooo baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaar baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaz</div>`
      )
    ).toEqual(
      // eslint-disable-next-line  max-len
      [
        'Foooooooooooooooooo baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa [...]',
        'inferred',
      ]
    )
  })

  it('normalize white spaces', () => {
    expect(getActionNameFromElement(element`<div>foo\tbar\n\n  baz</div>`)).toEqual(['foo bar baz', 'inferred'])
  })

  it('ignores the inline script textual content', () => {
    expect(getActionNameFromElement(element`<div><script>console.log('toto')</script>b</div>`)).toEqual([
      'b',
      'inferred',
    ])
  })

  it('extracts text from SVG elements', () => {
    expect(getActionNameFromElement(element`<svg><text>foo  bar</text></svg>`)).toEqual(['foo bar', 'inferred'])
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
    ).toEqual(['label text', 'inferred'])
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
    ).toEqual(['foo bar', 'inferred'])
  })

  it('extracts text from the first OPTION element when clicking on a SELECT', () => {
    expect(
      getActionNameFromElement(element`
        <select>
          <option>foo</option>
          <option>bar</option>
        </select>
      `)
    ).toEqual(['foo', 'inferred'])
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
    ).toEqual(['label text', 'inferred'])
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
    ).toEqual(['label text', 'inferred'])
  })

  it('extracts text from a BUTTON element', () => {
    expect(
      getActionNameFromElement(element`
        <div>
          <div>ignored</div>
          <button target>foo</button>
        </div>
      `)
    ).toEqual(['foo', 'inferred'])
  })

  it('extracts text from a role=button element', () => {
    expect(
      getActionNameFromElement(element`
        <div>
          <div>ignored</div>
          <div role="button" target>foo</div>
        </div>
      `)
    ).toEqual(['foo', 'inferred'])
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
    ).toEqual(['', 'inferred'])
  })

  it('limits the recursion to the BODY element', () => {
    expect(
      getActionNameFromElement(element`
        <div>ignored</div>
        <i target></i>
      `)
    ).toEqual(['', 'inferred'])
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
    ).toEqual(['', 'inferred'])
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
    ).toEqual(['foo', 'inferred'])
  })

  it('extracts the whole textual content of a button', () => {
    expect(
      getActionNameFromElement(element`
        <button>
          foo
          <i target>bar</i>
        </button>
      `)
    ).toEqual(['foo bar', 'inferred'])
  })

  it('ignores the textual content of contenteditable elements', () => {
    expect(
      getActionNameFromElement(element`
        <div contenteditable>
          <i target>ignored</i>
          ignored
        </div>
      `)
    ).toEqual(['', 'inferred'])
  })

  it('extracts the name from attributes of contenteditable elements', () => {
    expect(
      getActionNameFromElement(element`
        <div contenteditable>
          <i aria-label="foo" target>ignored</i>
          ignored
        </div>
      `)
    ).toEqual(['foo', 'inferred'])
  })

  describe('programmatically declared action name', () => {
    it('extracts the name from the data-dd-action-name attribute', () => {
      expect(
        getActionNameFromElement(element`
          <div data-dd-action-name="foo">ignored</div>
        `)
      ).toEqual(['foo', 'programmatic'])
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
      expect(getActionNameFromElement(target)).toEqual(['foo', 'programmatic'])
    })

    it('normalizes the value', () => {
      expect(
        getActionNameFromElement(element`
          <div data-dd-action-name="   foo  \t bar  ">ignored</div>
        `)
      ).toEqual(['foo bar', 'programmatic'])
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
      ).toEqual(['foo', 'inferred'])
    })
  })
})
