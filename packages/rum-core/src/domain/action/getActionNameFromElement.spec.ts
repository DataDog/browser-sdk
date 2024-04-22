import { appendElement } from '../../../test'
import { getActionNameFromElement } from './getActionNameFromElement'

describe('getActionNameFromElement', () => {
  it('extracts the textual content of an element', () => {
    const { name } = getActionNameFromElement(appendElement('<div>Foo <div>bar</div></div>'))
    expect(name).toBe('Foo bar')
  })

  it('extracts the text of an input button', () => {
    const { name } = getActionNameFromElement(appendElement('<input type="button" value="Click" />'))
    expect(name).toBe('Click')
  })

  it('extracts the alt text of an image', () => {
    const { name } = getActionNameFromElement(appendElement('<img title="foo" alt="bar" />'))
    expect(name).toBe('bar')
  })

  it('extracts the title text of an image', () => {
    const { name } = getActionNameFromElement(appendElement('<img title="foo" />'))
    expect(name).toBe('foo')
  })

  it('extracts the text of an aria-label attribute', () => {
    const { name } = getActionNameFromElement(appendElement('<span aria-label="Foo" />'))
    expect(name).toBe('Foo')
  })

  it('gets the parent element textual content if everything else fails', () => {
    const { name } = getActionNameFromElement(appendElement('<div>Foo <img target /></div>'))
    expect(name).toBe('Foo')
  })

  it("doesn't get the value of a text input", () => {
    const { name } = getActionNameFromElement(appendElement('<input type="text" value="foo" />'))
    expect(name).toBe('')
  })

  it("doesn't get the value of a password input", () => {
    const { name } = getActionNameFromElement(appendElement('<input type="password" value="foo" />'))
    expect(name).toBe('')
  })

  it('limits the name length to a reasonable size', () => {
    const { name } = getActionNameFromElement(
      appendElement(
        '<div>Foooooooooooooooooo baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaar baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaz</div>'
      )
    )
    expect(name).toBe(
      'Foooooooooooooooooo baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa [...]'
    )
  })

  it('normalize white spaces', () => {
    const { name } = getActionNameFromElement(appendElement('<div>foo\tbar\n\n  baz</div>'))
    expect(name).toBe('foo bar baz')
  })

  it('ignores the inline script textual content', () => {
    const { name } = getActionNameFromElement(appendElement("<div><script>console.log('toto')</script>b</div>"))
    expect(name).toBe('b')
  })

  it('extracts text from SVG elements', () => {
    const { name } = getActionNameFromElement(appendElement('<svg><text>foo  bar</text></svg>'))
    expect(name).toBe('foo bar')
  })

  it('extracts text from an associated label', () => {
    const { name } = getActionNameFromElement(
      appendElement(`
      <div>
        <label for="toto">label text</label>
        <div>ignored</div>
        <input id="toto" target />
      </div>
    `)
    )
    expect(name).toBe('label text')
  })

  it('extracts text from a parent label', () => {
    const { name } = getActionNameFromElement(
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
    expect(name).toBe('foo bar')
  })

  it('extracts text from the first OPTION element when clicking on a SELECT', () => {
    const { name } = getActionNameFromElement(
      appendElement(`
      <select>
        <option>foo</option>
        <option>bar</option>
      </select>
    `)
    )
    expect(name).toBe('foo')
  })

  it('extracts text from a aria-labelledby associated element', () => {
    const { name } = getActionNameFromElement(
      appendElement(`
      <div>
        <label id="toto">label text</label>
        <div>ignored</div>
        <input aria-labelledby="toto" target />
      </div>
    `)
    )
    expect(name).toBe('label text')
  })

  it('extracts text from multiple aria-labelledby associated elements', () => {
    const { name } = getActionNameFromElement(
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
    expect(name).toBe('label text')
  })

  it('extracts text from a BUTTON element', () => {
    const { name } = getActionNameFromElement(
      appendElement(`
      <div>
        <div>ignored</div>
        <button target>foo</button>
      </div>
    `)
    )
    expect(name).toBe('foo')
  })

  it('extracts text from a role=button element', () => {
    const { name } = getActionNameFromElement(
      appendElement(`
      <div>
        <div>ignored</div>
        <div role="button" target>foo</div>
      </div>
    `)
    )
    expect(name).toBe('foo')
  })

  it('limits the recursion to the 10th parent', () => {
    const { name } = getActionNameFromElement(
      appendElement(`
      <div>
        <div>ignored</div>
        <i><i><i><i><i><i><i><i><i><i>
          <i target></i>
        </i></i></i></i></i></i></i></i></i></i>
      </div>
    `)
    )
    expect(name).toBe('')
  })

  it('limits the recursion to the BODY element', () => {
    const { name } = getActionNameFromElement(
      appendElement(`
      <div>ignored</div>
      <i target></i>
    `)
    )
    expect(name).toBe('')
  })

  it('limits the recursion to a FORM element', () => {
    const { name } = getActionNameFromElement(
      appendElement(`
      <div>
        <div>ignored</div>
        <form>
          <i target></i>
        </form>
      </div>
    `)
    )
    expect(name).toBe('')
  })

  it('extracts the name from a parent FORM element', () => {
    const { name } = getActionNameFromElement(
      appendElement(`
      <div>
        <div>ignored</div>
        <form title="foo">
          <i target></i>
        </form>
      </div>
    `)
    )
    expect(name).toBe('foo')
  })

  it('extracts the whole textual content of a button', () => {
    const { name } = getActionNameFromElement(
      appendElement(`
      <button>
        foo
        <i target>bar</i>
      </button>
    `)
    )
    expect(name).toBe('foo bar')
  })

  it('ignores the textual content of contenteditable elements', () => {
    const { name } = getActionNameFromElement(
      appendElement(`
      <div contenteditable>
        <i target>ignored</i>
        ignored
      </div>
    `)
    )
    expect(name).toBe('')
  })

  it('extracts the name from attributes of contenteditable elements', () => {
    const { name } = getActionNameFromElement(
      appendElement(`
      <div contenteditable>
        <i aria-label="foo" target>ignored</i>
        ignored
      </div>
    `)
    )
    expect(name).toBe('foo')
  })

  it('computes an action name on SVG elements (IE does not support parentElement property on them)', () => {
    const { name } = getActionNameFromElement(
      appendElement(`
       <button>
        foo <svg target></svg>
       <button>
    `)
    )
    expect(name).toBe('foo')
  })

  describe('programmatically declared action name', () => {
    it('extracts the name from the data-dd-action-name attribute', () => {
      const { name } = getActionNameFromElement(
        appendElement(`
        <div data-dd-action-name="foo">ignored</div>
      `)
      )
      expect(name).toBe('foo')
    })

    it('considers any parent', () => {
      const { name } = getActionNameFromElement(
        appendElement(`
        <form data-dd-action-name="foo">
          <i><i><i><i><i><i><i><i><i><i><i><i>
            <span target>ignored</span>
          </i></i></i></i></i></i></i></i></i></i></i></i>
        </form>
      `)
      )
      expect(name).toBe('foo')
    })

    it('normalizes the value', () => {
      const { name } = getActionNameFromElement(
        appendElement(`
        <div data-dd-action-name="   foo  \t bar  ">ignored</div>
      `)
      )
      expect(name).toBe('foo bar')
    })

    it('fallback on an automatic strategy if the attribute is empty', () => {
      const { name } = getActionNameFromElement(
        appendElement(`
        <div data-dd-action-name="ignored">
          <div data-dd-action-name="">
            <span target>foo</span>
          </div>
        </div>
    `)
      )
      expect(name).toBe('foo')
    })

    it('extracts the name from a user-configured attribute', () => {
      const { name } = getActionNameFromElement(
        appendElement(`
        <div data-test-id="foo">ignored</div>
      `),
        'data-test-id'
      )
      expect(name).toBe('foo')
    })

    it('favors data-dd-action-name over user-configured attribute', () => {
      const { name } = getActionNameFromElement(
        appendElement(`
        <div data-test-id="foo" data-dd-action-name="bar">ignored</div>
      `),
        'data-test-id'
      )
      expect(name).toBe('bar')
    })

    it('remove children with programmatic action name in textual content', () => {
      const { name } = getActionNameFromElement(
        appendElement('<div>Foo <div data-dd-action-name="custom action">bar<div></div>')
      )

      expect(name).toBe('Foo')
    })

    it('remove children with programmatic action name in textual content based on the user-configured attribute', () => {
      const { name } = getActionNameFromElement(
        appendElement('<div>Foo <div data-test-id="custom action">bar<div></div>'),
        'data-test-id'
      )
      expect(name).toBe('Foo')
    })
  })

  describe('with privacyEnabledForActionName', () => {
    const { name } = getActionNameFromElement(
      appendElement(`
        <div data-dd-action-name="foo">
          <span target>ignored</span>
        </div>
  `),
      undefined,
      false
    )
    it('extracts attribute text when privacyEnabledActionName is false', () => {
      expect(name).toBe('foo')
    })

    it('extracts user defined attribute text when privacyEnabledActionName is false', () => {
      const { name } = getActionNameFromElement(
        appendElement(`
          <div data-test-id="foo">
            <span target>ignored</span>
          </div>
    `),
        'data-test-id',
        false
      )
      expect(name).toBe('foo')
    })

    it('extracts inner text when privacyEnabledActionName is false and attribute is empty', () => {
      const { name } = getActionNameFromElement(
        appendElement(`
          <div data-test-id="">
            <span target>foo</span>
          </div>
    `),
        'data-test-id',
        false
      )
      expect(name).toBe('foo')
    })

    it('returns placeholder when privacyEnabledActionName is true and attribute is empty', () => {
      expect(
        getActionNameFromElement(
          appendElement(`
            <div data-test-id="">
              <span target>foo</span>
            </div>
      `),
          'data-test-id',
          true
        )
      ).toEqual({ name: 'Masked Element', masked: true })
    })

    it('extracts default attribute text when privacyEnabledActionName is true', () => {
      expect(
        getActionNameFromElement(
          appendElement(`
            <div data-dd-action-name="foo">
              <span target>ignored</span>
            </div>
      `),
          undefined,
          true
        )
      ).toEqual({ name: 'foo', masked: false })
    })

    it('extracts user defined attribute text when privacyEnabledActionName is true', () => {
      expect(
        getActionNameFromElement(
          appendElement(`
            <div data-test-id="foo">
              <span target>ignored</span>
            </div>
      `),
          'data-test-id',
          true
        )
      ).toEqual({ name: 'foo', masked: false })
    })
  })
})
