import { appendElement, mockRumConfiguration } from '../../../test'
import { NodePrivacyLevel } from '../privacy'
import { getActionNameFromElement } from './getActionNameFromElement'

const defaultConfiguration = mockRumConfiguration()

describe('getActionNameFromElement', () => {
  it('extracts the textual content of an element', () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement('<div>Foo <div>bar</div></div>'),
      defaultConfiguration
    )
    expect(name).toBe('Foo bar')
    expect(namingSource).toBe('text_content')
  })

  it('extracts the text of an input button', () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement('<input type="button" value="Click" />'),
      defaultConfiguration
    )
    expect(name).toBe('Click')
    expect(namingSource).toBe('standard_attribute')
  })

  it('extracts the alt text of an image', () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement('<img title="foo" alt="bar" />'),
      defaultConfiguration
    )
    expect(name).toBe('bar')
    expect(namingSource).toBe('standard_attribute')
  })

  it('extracts the title text of an image', () => {
    const { name, namingSource } = getActionNameFromElement(appendElement('<img title="foo" />'), defaultConfiguration)
    expect(name).toBe('foo')
    expect(namingSource).toBe('standard_attribute')
  })

  it('extracts the text of an aria-label attribute', () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement('<span aria-label="Foo" />'),
      defaultConfiguration
    )
    expect(name).toBe('Foo')
    expect(namingSource).toBe('standard_attribute')
  })

  it('gets the parent element textual content if everything else fails', () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement('<div>Foo <img target /></div>'),
      defaultConfiguration
    )
    expect(name).toBe('Foo')
    expect(namingSource).toBe('text_content')
  })

  it("doesn't get the value of a text input", () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement('<input type="text" value="foo" />'),
      defaultConfiguration
    )
    expect(name).toBe('')
    expect(namingSource).toBe('text_content')
  })

  it("doesn't get the value of a password input", () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement('<input type="password" value="foo" />'),
      defaultConfiguration
    )
    expect(name).toBe('')
    expect(namingSource).toBe('text_content')
  })

  it('limits the { name, namingSource } length to a reasonable size', () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement(
        '<div>Foooooooooooooooooo baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaar baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaz</div>'
      ),
      defaultConfiguration
    )
    expect(name).toBe(
      'Foooooooooooooooooo baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa [...]'
    )
    expect(namingSource).toBe('text_content')
  })

  it('normalize white spaces', () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement('<div>foo\tbar\n\n  baz</div>'),
      defaultConfiguration
    )
    expect(name).toBe('foo bar baz')
    expect(namingSource).toBe('text_content')
  })

  it('ignores the inline script textual content', () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement("<div><script>console.log('toto')</script>b</div>"),
      defaultConfiguration
    )
    expect(name).toBe('b')
    expect(namingSource).toBe('text_content')
  })

  it('extracts text from SVG elements', () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement('<svg><text>foo  bar</text></svg>'),
      defaultConfiguration
    )
    expect(name).toBe('foo bar')
    expect(namingSource).toBe('text_content')
  })

  it('extracts text from an associated label', () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement(`
      <div>
        <label for="toto">label text</label>
        <div>ignored</div>
        <input id="toto" target />
      </div>
    `),
      defaultConfiguration
    )
    expect(name).toBe('label text')
    expect(namingSource).toBe('standard_attribute')
  })

  it('extracts text from a parent label', () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement(`
      <label>
        foo
        <div>
          bar
          <input target />
        </div>
      </label>
    `),
      defaultConfiguration
    )
    expect(name).toBe('foo bar')
    expect(namingSource).toBe('standard_attribute')
  })

  it('extracts text from the first OPTION element when clicking on a SELECT', () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement(`
      <select>
        <option>foo</option>
        <option>bar</option>
      </select>
    `),
      defaultConfiguration
    )
    expect(name).toBe('foo')
    expect(namingSource).toBe('standard_attribute')
  })

  it('extracts text from a aria-labelledby associated element', () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement(`
      <div>
        <label id="toto">label text</label>
        <div>ignored</div>
        <input aria-labelledby="toto" target />
      </div>
    `),
      defaultConfiguration
    )
    expect(name).toBe('label text')
    expect(namingSource).toBe('standard_attribute')
  })

  it('extracts text from multiple aria-labelledby associated elements', () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement(`
      <div>
        <label id="toto1">label</label>
        <div>ignored</div>
        <input aria-labelledby="toto1 toto2" target />
        <div>ignored</div>
        <label id="toto2">text</label>
      </div>
    `),
      defaultConfiguration
    )
    expect(name).toBe('label text')
    expect(namingSource).toBe('standard_attribute')
  })

  it('extracts text from a BUTTON element', () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement(`
      <div>
        <div>ignored</div>
        <button target>foo</button>
      </div>
    `),
      defaultConfiguration
    )
    expect(name).toBe('foo')
    expect(namingSource).toBe('standard_attribute')
  })

  it('extracts text from a role=button element', () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement(`
      <div>
        <div>ignored</div>
        <div role="button" target>foo</div>
      </div>
    `),
      defaultConfiguration
    )
    expect(name).toBe('foo')
    expect(namingSource).toBe('standard_attribute')
  })

  it('limits the recursion to the 10th parent', () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement(`
      <div>
        <div>ignored</div>
        <i><i><i><i><i><i><i><i><i><i>
          <i target></i>
        </i></i></i></i></i></i></i></i></i></i>
      </div>
    `),
      defaultConfiguration
    )
    expect(name).toBe('')
    expect(namingSource).toBe('text_content')
  })

  it('limits the recursion to the BODY element', () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement(`
      <div>ignored</div>
      <i target></i>
    `),
      defaultConfiguration
    )
    expect(name).toBe('')
    expect(namingSource).toBe('text_content')
  })

  it('limits the recursion to a FORM element', () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement(`
      <div>
        <div>ignored</div>
        <form>
          <i target></i>
        </form>
      </div>
    `),
      defaultConfiguration
    )
    expect(name).toBe('')
    expect(namingSource).toBe('text_content')
  })

  it('extracts the { name, namingSource } from a parent FORM element', () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement(`
      <div>
        <div>ignored</div>
        <form title="foo">
          <i target></i>
        </form>
      </div>
    `),
      defaultConfiguration
    )
    expect(name).toBe('foo')
    expect(namingSource).toBe('standard_attribute')
  })

  it('extracts the whole textual content of a button', () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement(`
      <button>
        foo
        <i target>bar</i>
      </button>
    `),
      defaultConfiguration
    )
    expect(name).toBe('foo bar')
    expect(namingSource).toBe('standard_attribute')
  })

  it('ignores the textual content of contenteditable elements', () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement(`
      <div contenteditable>
        <i target>ignored</i>
        ignored
      </div>
    `),
      defaultConfiguration
    )
    expect(name).toBe('')
    expect(namingSource).toBe('text_content')
  })

  it('extracts the { name, namingSource } from attributes of contenteditable elements', () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement(`
      <div contenteditable>
        <i aria-label="foo" target>ignored</i>
        ignored
      </div>
    `),
      defaultConfiguration
    )
    expect(name).toBe('foo')
    expect(namingSource).toBe('standard_attribute')
  })

  it('computes an action name on SVG elements (IE does not support parentElement property on them)', () => {
    const { name, namingSource } = getActionNameFromElement(
      appendElement(`
       <button>
        foo <svg target></svg>
       <button>
    `),
      defaultConfiguration
    )
    expect(name).toBe('foo')
    expect(namingSource).toBe('standard_attribute')
  })

  describe('programmatically declared action name', () => {
    it('extracts the name from the data-dd-action-name attribute', () => {
      const { name, namingSource } = getActionNameFromElement(
        appendElement(`
        <div data-dd-action-name="foo">ignored</div>
      `),
        defaultConfiguration
      )
      expect(name).toBe('foo')
      expect(namingSource).toBe('custom_attribute')
    })

    it('considers any parent', () => {
      const { name, namingSource } = getActionNameFromElement(
        appendElement(`
        <form data-dd-action-name="foo">
          <i><i><i><i><i><i><i><i><i><i><i><i>
            <span target>ignored</span>
          </i></i></i></i></i></i></i></i></i></i></i></i>
        </form>
      `),
        defaultConfiguration
      )
      expect(name).toBe('foo')
      expect(namingSource).toBe('custom_attribute')
    })

    it('normalizes the value', () => {
      const { name, namingSource } = getActionNameFromElement(
        appendElement(`
        <div data-dd-action-name="   foo  \t bar  ">ignored</div>
      `),
        defaultConfiguration
      )
      expect(name).toBe('foo bar')
      expect(namingSource).toBe('custom_attribute')
    })

    it('fallback on an automatic strategy if the attribute is empty', () => {
      const { name, namingSource } = getActionNameFromElement(
        appendElement(`
        <div data-dd-action-name="ignored">
          <div data-dd-action-name="">
            <span target>foo</span>
          </div>
        </div>
    `),
        defaultConfiguration
      )
      expect(name).toBe('foo')
      expect(namingSource).toBe('text_content')
    })

    it('extracts the name from a user-configured attribute', () => {
      const { name, namingSource } = getActionNameFromElement(
        appendElement(`
        <div data-test-id="foo">ignored</div>
      `),
        {
          ...defaultConfiguration,
          actionNameAttribute: 'data-test-id',
        },
        undefined
      )
      expect(name).toBe('foo')
      expect(namingSource).toBe('custom_attribute')
    })

    it('favors data-dd-action-name over user-configured attribute', () => {
      const { name, namingSource } = getActionNameFromElement(
        appendElement(`
        <div data-test-id="foo" data-dd-action-name="bar">ignored</div>
      `),
        {
          ...defaultConfiguration,
          actionNameAttribute: 'data-test-id',
        },
        undefined
      )
      expect(name).toBe('bar')
      expect(namingSource).toBe('custom_attribute')
    })

    it('remove children with programmatic action name in textual content', () => {
      const { name, namingSource } = getActionNameFromElement(
        appendElement('<div>Foo <div data-dd-action-name="custom action">bar<div></div>'),
        defaultConfiguration
      )

      expect(name).toBe('Foo')
      expect(namingSource).toBe('text_content')
    })

    it('remove children with programmatic action name in textual content based on the user-configured attribute', () => {
      const { name, namingSource } = getActionNameFromElement(
        appendElement('<div>Foo <div data-test-id="custom action">bar<div></div>'),
        {
          ...defaultConfiguration,
          actionNameAttribute: 'data-test-id',
        },
        undefined
      )
      expect(name).toBe('Foo')
      expect(namingSource).toBe('text_content')
    })
  })

  describe('with privacyEnabledForActionName', () => {
    it('extracts attribute text when privacyEnabledActionName is false', () => {
      const { name, namingSource } = getActionNameFromElement(
        appendElement(`
          <div data-dd-action-name="foo">
            <span target>ignored</span>
          </div>
    `),
        defaultConfiguration,
        NodePrivacyLevel.MASK
      )
      expect(name).toBe('foo')
      expect(namingSource).toBe('custom_attribute')
    })

    it('extracts user defined attribute text when privacyEnabledActionName is false', () => {
      const { name, namingSource } = getActionNameFromElement(
        appendElement(`
          <div data-test-id="foo">
            <span target>ignored</span>
          </div>
    `),
        {
          ...defaultConfiguration,
          actionNameAttribute: 'data-test-id',
        },
        NodePrivacyLevel.MASK
      )
      expect(name).toBe('foo')
      expect(namingSource).toBe('custom_attribute')
    })

    it('extracts inner text when privacyEnabledActionName is false and custom action name set to empty', () => {
      const { name, namingSource } = getActionNameFromElement(
        appendElement(`
          <div data-test-id="">
            <span target>foo</span>
          </div>
    `),
        {
          ...defaultConfiguration,
          actionNameAttribute: 'data-test-id',
        },
        NodePrivacyLevel.ALLOW
      )
      expect(name).toBe('foo')
      expect(namingSource).toBe('text_content')
    })

    it('returns placeholder when privacyEnabledActionName is true and custom action name set to empty', () => {
      expect(
        getActionNameFromElement(
          appendElement(`
            <div data-test-id="">
              <span target>foo</span>
            </div>
      `),
          {
            ...defaultConfiguration,
            actionNameAttribute: 'data-test-id',
            enablePrivacyForActionName: true,
          },
          NodePrivacyLevel.MASK
        )
      ).toEqual({ name: 'Masked Element', namingSource: 'mask_placeholder' })
    })

    it('extracts default attribute text when privacyEnabledActionName is true', () => {
      expect(
        getActionNameFromElement(
          appendElement(`
            <div data-dd-action-name="foo">
              <span target>ignored</span>
            </div>
      `),
          defaultConfiguration,
          NodePrivacyLevel.ALLOW
        )
      ).toEqual({ name: 'foo', namingSource: 'custom_attribute' })
    })

    it('extracts user defined attribute text when privacyEnabledActionName is true', () => {
      expect(
        getActionNameFromElement(
          appendElement(`
            <div data-test-id="foo">
              <span target>ignored</span>
            </div>
      `),
          {
            ...defaultConfiguration,
            actionNameAttribute: 'data-test-id',
          },
          NodePrivacyLevel.ALLOW
        )
      ).toEqual({ name: 'foo', namingSource: 'custom_attribute' })
    })

    describe('with html tag privacy override when privacyEnabledActionName is true', () => {
      it('extracts inner text when privacy level is allow', () => {
        expect(
          getActionNameFromElement(
            appendElement(`
              <div data-dd-privacy="allow">
                <span target>foo</span>
              </div>
        `),
            defaultConfiguration,
            NodePrivacyLevel.ALLOW
          )
        ).toEqual({ name: 'foo', namingSource: 'text_content' })
      })

      it('returns placeholder when privacy level is mask', () => {
        expect(
          getActionNameFromElement(
            appendElement(`
              <div data-dd-privacy="mask">
                <span target>foo</span>
              </div>
        `),
            {
              ...defaultConfiguration,
              enablePrivacyForActionName: true,
            },
            NodePrivacyLevel.MASK
          )
        ).toEqual({ name: 'Masked Element', namingSource: 'mask_placeholder' })
      })

      it('inherit privacy level and does not fallback to masked child text', () => {
        expect(
          getActionNameFromElement(
            appendElement(`
              <div data-dd-privacy="allow">
                bar
                <div target>
                  foo
                  <div data-dd-privacy="mask">
                    <span>secret</span>
                  </div>
                </div>
              </div>
        `),
            {
              ...defaultConfiguration,
              enablePrivacyForActionName: true,
            },
            NodePrivacyLevel.ALLOW
          )
        ).toEqual({ name: 'foo', namingSource: 'text_content' })
      })
      it('fallback to children but not the masked one with mixed class name and attribute', () => {
        expect(
          getActionNameFromElement(
            appendElement(`
              <div data-dd-privacy="allow" target>
                bar
                <div>
                  foo
                  <div data-dd-privacy="hidden">
                    <span>secret</span>
                  </div>
                </div>
              </div>
        `),
            {
              ...defaultConfiguration,
              enablePrivacyForActionName: true,
            },
            NodePrivacyLevel.ALLOW
          )
        ).toEqual({ name: 'bar foo', namingSource: 'text_content' })
      })

      it('inherit privacy level and does not fallback to masked child text with mixed classname and attribute', () => {
        expect(
          getActionNameFromElement(
            appendElement(`
              <div class="dd-privacy-allow">
                bar
                <div target>
                  foo
                  <div data-dd-privacy="hidden">
                    <span>secret</span>
                  </div>
                </div>
              </div>
        `),
            {
              ...defaultConfiguration,
              enablePrivacyForActionName: true,
            },
            NodePrivacyLevel.ALLOW
          )
        ).toEqual({ name: 'foo', namingSource: 'text_content' })
      })
      it('fallback to children but not the masked one with class names', () => {
        expect(
          getActionNameFromElement(
            appendElement(`
              <div class="dd-privacy-allow" target>
                bar
                <div>
                  foo
                  <div class="dd-privacy-mask">
                    <span>secret</span>
                  </div>
                </div>
              </div>
        `),
            {
              ...defaultConfiguration,
              enablePrivacyForActionName: true,
            },
            NodePrivacyLevel.ALLOW
          )
        ).toEqual({ name: 'bar foo', namingSource: 'text_content' })
      })
    })
  })
})
