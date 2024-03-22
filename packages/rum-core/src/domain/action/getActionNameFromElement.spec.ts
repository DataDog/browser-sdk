import { appendElement } from '../../../test'
import { getActionNameFromElement } from './getActionNameFromElement'

describe('getActionNameFromElement', () => {
  it('extracts the textual content of an element', () => {
    expect(getActionNameFromElement(appendElement('<div>Foo <div>bar</div></div>'))).toBe('Foo bar')
  })

  it('extracts the text of an input button', () => {
    expect(getActionNameFromElement(appendElement('<input type="button" value="Click" />'))).toBe('Click')
  })

  it('extracts the alt text of an image', () => {
    expect(getActionNameFromElement(appendElement('<img title="foo" alt="bar" />'))).toBe('bar')
  })

  it('extracts the title text of an image', () => {
    expect(getActionNameFromElement(appendElement('<img title="foo" />'))).toBe('foo')
  })

  it('extracts the text of an aria-label attribute', () => {
    expect(getActionNameFromElement(appendElement('<span aria-label="Foo" />'))).toBe('Foo')
  })

  it('gets the parent element textual content if everything else fails', () => {
    expect(getActionNameFromElement(appendElement('<div>Foo <img target /></div>'))).toBe('Foo')
  })

  it("doesn't get the value of a text input", () => {
    expect(getActionNameFromElement(appendElement('<input type="text" value="foo" />'))).toBe('')
  })

  it("doesn't get the value of a password input", () => {
    expect(getActionNameFromElement(appendElement('<input type="password" value="foo" />'))).toBe('')
  })

  it('limits the name length to a reasonable size', () => {
    expect(
      getActionNameFromElement(
        appendElement(
          '<div>Foooooooooooooooooo baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaar baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaz</div>'
        )
      )
    ).toBe('Foooooooooooooooooo baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa [...]')
  })

  it('normalize white spaces', () => {
    expect(getActionNameFromElement(appendElement('<div>foo\tbar\n\n  baz</div>'))).toBe('foo bar baz')
  })

  it('ignores the inline script textual content', () => {
    expect(getActionNameFromElement(appendElement("<div><script>console.log('toto')</script>b</div>"))).toBe('b')
  })

  it('extracts text from SVG elements', () => {
    expect(getActionNameFromElement(appendElement('<svg><text>foo  bar</text></svg>'))).toBe('foo bar')
  })

  it('extracts text from an associated label', () => {
    expect(
      getActionNameFromElement(
        appendElement(`
        <div>
          <label for="toto">label text</label>
          <div>ignored</div>
          <input id="toto" target />
        </div>
      `)
      )
    ).toBe('label text')
  })

  it('extracts text from a parent label', () => {
    expect(
      getActionNameFromElement(
        appendElement(`
        <label>
          foo
          <div>
            bar
            <input target />
          </div>
        </label>
      `)
      )
    ).toBe('foo bar')
  })

  it('extracts text from the first OPTION element when clicking on a SELECT', () => {
    expect(
      getActionNameFromElement(
        appendElement(`
        <select>
          <option>foo</option>
          <option>bar</option>
        </select>
      `)
      )
    ).toBe('foo')
  })

  it('extracts text from a aria-labelledby associated element', () => {
    expect(
      getActionNameFromElement(
        appendElement(`
        <div>
          <label id="toto">label text</label>
          <div>ignored</div>
          <input aria-labelledby="toto" target />
        </div>
      `)
      )
    ).toBe('label text')
  })

  it('extracts text from multiple aria-labelledby associated elements', () => {
    expect(
      getActionNameFromElement(
        appendElement(`
        <div>
          <label id="toto1">label</label>
          <div>ignored</div>
          <input aria-labelledby="toto1 toto2" target />
          <div>ignored</div>
          <label id="toto2">text</label>
        </div>
      `)
      )
    ).toBe('label text')
  })

  it('extracts text from a BUTTON element', () => {
    expect(
      getActionNameFromElement(
        appendElement(`
        <div>
          <div>ignored</div>
          <button target>foo</button>
        </div>
      `)
      )
    ).toBe('foo')
  })

  it('extracts text from a role=button element', () => {
    expect(
      getActionNameFromElement(
        appendElement(`
        <div>
          <div>ignored</div>
          <div role="button" target>foo</div>
        </div>
      `)
      )
    ).toBe('foo')
  })

  it('limits the recursion to the 10th parent', () => {
    expect(
      getActionNameFromElement(
        appendElement(`
        <div>
          <div>ignored</div>
          <i><i><i><i><i><i><i><i><i><i>
            <i target></i>
          </i></i></i></i></i></i></i></i></i></i>
        </div>
      `)
      )
    ).toBe('')
  })

  it('limits the recursion to the BODY element', () => {
    expect(
      getActionNameFromElement(
        appendElement(`
        <div>ignored</div>
        <i target></i>
      `)
      )
    ).toBe('')
  })

  it('limits the recursion to a FORM element', () => {
    expect(
      getActionNameFromElement(
        appendElement(`
        <div>
          <div>ignored</div>
          <form>
            <i target></i>
          </form>
        </div>
      `)
      )
    ).toBe('')
  })

  it('extracts the name from a parent FORM element', () => {
    expect(
      getActionNameFromElement(
        appendElement(`
        <div>
          <div>ignored</div>
          <form title="foo">
            <i target></i>
          </form>
        </div>
      `)
      )
    ).toBe('foo')
  })

  it('extracts the whole textual content of a button', () => {
    expect(
      getActionNameFromElement(
        appendElement(`
        <button>
          foo
          <i target>bar</i>
        </button>
      `)
      )
    ).toBe('foo bar')
  })

  it('ignores the textual content of contenteditable elements', () => {
    expect(
      getActionNameFromElement(
        appendElement(`
        <div contenteditable>
          <i target>ignored</i>
          ignored
        </div>
      `)
      )
    ).toBe('')
  })

  it('extracts the name from attributes of contenteditable elements', () => {
    expect(
      getActionNameFromElement(
        appendElement(`
        <div contenteditable>
          <i aria-label="foo" target>ignored</i>
          ignored
        </div>
      `)
      )
    ).toBe('foo')
  })

  it('computes an action name on SVG elements (IE does not support parentElement property on them)', () => {
    expect(
      getActionNameFromElement(
        appendElement(`
         <button>
          foo <svg target></svg>
         <button>
      `)
      )
    ).toBe('foo')
  })

  describe('programmatically declared action name', () => {
    it('extracts the name from the data-dd-action-name attribute', () => {
      expect(
        getActionNameFromElement(
          appendElement(`
          <div data-dd-action-name="foo">ignored</div>
        `)
        )
      ).toBe('foo')
    })

    it('considers any parent', () => {
      const target = appendElement(`
        <form data-dd-action-name="foo">
          <i><i><i><i><i><i><i><i><i><i><i><i>
            <span target>ignored</span>
          </i></i></i></i></i></i></i></i></i></i></i></i>
        </form>
      `)
      expect(getActionNameFromElement(target)).toBe('foo')
    })

    it('normalizes the value', () => {
      expect(
        getActionNameFromElement(
          appendElement(`
          <div data-dd-action-name="   foo  \t bar  ">ignored</div>
        `)
        )
      ).toBe('foo bar')
    })

    it('fallback on an automatic strategy if the attribute is empty', () => {
      expect(
        getActionNameFromElement(
          appendElement(`
          <div data-dd-action-name="ignored">
            <div data-dd-action-name="">
              <span target>foo</span>
            </div>
          </div>
      `)
        )
      ).toBe('foo')
    })

    it('extracts the name from a user-configured attribute', () => {
      expect(
        getActionNameFromElement(
          appendElement(`
          <div data-test-id="foo">ignored</div>
        `),
          'data-test-id'
        )
      ).toBe('foo')
    })

    it('favors data-dd-action-name over user-configured attribute', () => {
      expect(
        getActionNameFromElement(
          appendElement(`
          <div data-test-id="foo" data-dd-action-name="bar">ignored</div>
        `),
          'data-test-id'
        )
      ).toBe('bar')
    })

    it('remove children with programmatic action name in textual content', () => {
      expect(
        getActionNameFromElement(appendElement('<div>Foo <div data-dd-action-name="custom action">bar<div></div>'))
      ).toBe('Foo')
    })

    it('remove children with programmatic action name in textual content based on the user-configured attribute', () => {
      expect(
        getActionNameFromElement(
          appendElement('<div>Foo <div data-test-id="custom action">bar<div></div>'),
          'data-test-id'
        )
      ).toBe('Foo')
    })
  })
})
