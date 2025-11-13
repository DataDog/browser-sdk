import { ExperimentalFeature } from '@datadog/browser-core'
import { mockExperimentalFeatures } from '../../../../core/test'
import { appendElement, mockRumConfiguration } from '../../../test'
import { NodePrivacyLevel } from '../privacyConstants'
import { getNodeSelfPrivacyLevel } from '../privacy'
import { getActionNameFromElement } from './getActionNameFromElement'
import { ActionNameSource } from './actionNameConstants'

const defaultConfiguration = mockRumConfiguration()

describe('getActionNameFromElement', () => {
  it('extracts the textual content of an element', () => {
    const { name, nameSource } = getActionNameFromElement(
      appendElement('<div>Foo <div>bar</div></div>'),
      defaultConfiguration
    )
    expect(name).toBe('Foo bar')
    expect(nameSource).toBe('text_content')
  })

  it('extracts the text of an input button', () => {
    const { name, nameSource } = getActionNameFromElement(
      appendElement('<input type="button" value="Click" />'),
      defaultConfiguration
    )
    expect(name).toBe('Click')
    expect(nameSource).toBe('text_content')
  })

  it('extracts the alt text of an image', () => {
    const { name, nameSource } = getActionNameFromElement(
      appendElement('<img title="foo" alt="bar" />'),
      defaultConfiguration
    )
    expect(name).toBe('bar')
    expect(nameSource).toBe('standard_attribute')
  })

  it('extracts the title text of an image', () => {
    const { name, nameSource } = getActionNameFromElement(appendElement('<img title="foo" />'), defaultConfiguration)
    expect(name).toBe('foo')
    expect(nameSource).toBe('standard_attribute')
  })

  it('extracts the text of an aria-label attribute', () => {
    const { name, nameSource } = getActionNameFromElement(
      appendElement('<span aria-label="Foo" />'),
      defaultConfiguration
    )
    expect(name).toBe('Foo')
    expect(nameSource).toBe('standard_attribute')
  })

  it('gets the parent element textual content if everything else fails', () => {
    const { name, nameSource } = getActionNameFromElement(
      appendElement('<div>Foo <img target /></div>'),
      defaultConfiguration
    )
    expect(name).toBe('Foo')
    expect(nameSource).toBe('text_content')
  })

  it("doesn't get the value of a text input", () => {
    const { name, nameSource } = getActionNameFromElement(
      appendElement('<input type="text" value="foo" />'),
      defaultConfiguration
    )
    expect(name).toBe('')
    expect(nameSource).toBe('blank')
  })

  it("doesn't get the value of a password input", () => {
    const { name, nameSource } = getActionNameFromElement(
      appendElement('<input type="password" value="foo" />'),
      defaultConfiguration
    )
    expect(name).toBe('')
    expect(nameSource).toBe('blank')
  })

  it('limits the { name, nameSource } length to a reasonable size', () => {
    const { name, nameSource } = getActionNameFromElement(
      appendElement(
        '<div>Foooooooooooooooooo baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaar baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaz</div>'
      ),
      defaultConfiguration
    )
    expect(name).toBe(
      'Foooooooooooooooooo baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa [...]'
    )
    expect(nameSource).toBe('text_content')
  })

  it('normalize white spaces', () => {
    const { name, nameSource } = getActionNameFromElement(
      appendElement('<div>foo\tbar\n\n  baz</div>'),
      defaultConfiguration
    )
    expect(name).toBe('foo bar baz')
    expect(nameSource).toBe('text_content')
  })

  it('should correctly compute whitespace for <br> and <p> elements', () => {
    const testCases = [
      { element: appendElement('<div>hello<br/>world</div>'), expected: 'hello world' },
      { element: appendElement('<div>hello<p>world</p></div>'), expected: 'hello world' },
      { element: appendElement('<div>hello<p>world<br/>!</p></div>'), expected: 'hello world !' },
      { element: appendElement('<div>hello world<br/>!<p>!</p></div>'), expected: 'hello world ! !' },
    ]
    testCases.forEach(({ element, expected }) => {
      const { name, nameSource } = getActionNameFromElement(element, defaultConfiguration)
      expect(name).toBe(expected)
      expect(nameSource).toBe('text_content')
    })
  })

  it('should introduce whitespace for block-level display values', () => {
    mockExperimentalFeatures([ExperimentalFeature.USE_TREE_WALKER_FOR_ACTION_NAME])
    const testCases = [
      { display: 'block', expected: 'space' },
      { display: 'inline-block', expected: 'no-space' },
      { display: 'flex', expected: 'space' },
      { display: 'inline-flex', expected: 'no-space' },
      { display: 'grid', expected: 'space' },
      { display: 'inline-grid', expected: 'no-space' },
      { display: 'list-item', expected: 'space' },
      { display: 'table', expected: 'space' },
      { display: 'table-caption', expected: 'space' },
      { display: 'inline', expected: 'no-space' },
      { display: 'none', expected: 'nothing' },
    ]
    testCases.forEach(({ display, expected }) => {
      const element = appendElement(
        `<div><div style="display: ${display}">foo</div><div style="display: ${display}">bar</div></div>`
      )
      const { name, nameSource } = getActionNameFromElement(element, defaultConfiguration)
      switch (expected) {
        case 'space':
          expect(name).toBe('foo bar')
          expect(nameSource).toBe('text_content')
          break
        case 'no-space':
          expect(name).toBe('foobar')
          expect(nameSource).toBe('text_content')
          break
        case 'nothing':
          expect(name).toBe('')
          expect(nameSource).toBe('blank')
          break
      }
    })
  })

  it('ignores the inline script textual content', () => {
    const { name, nameSource } = getActionNameFromElement(
      appendElement("<div><script>console.log('toto')</script>b</div>"),
      defaultConfiguration
    )
    expect(name).toBe('b')
    expect(nameSource).toBe('text_content')
  })

  it('extracts text from SVG elements', () => {
    const { name, nameSource } = getActionNameFromElement(
      appendElement('<svg><text>foo  bar</text></svg>'),
      defaultConfiguration
    )
    expect(name).toBe('foo bar')
    expect(nameSource).toBe('text_content')
  })

  it('extracts text from an associated label', () => {
    const { name, nameSource } = getActionNameFromElement(
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
    expect(nameSource).toBe('text_content')
  })

  it('extracts text from a parent label', () => {
    const { name, nameSource } = getActionNameFromElement(
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
    expect(nameSource).toBe('text_content')
  })

  it('extracts text from the first OPTION element when clicking on a SELECT', () => {
    const { name, nameSource } = getActionNameFromElement(
      appendElement(`
      <select>
        <option>foo</option>
        <option>bar</option>
      </select>
    `),
      defaultConfiguration
    )
    expect(name).toBe('foo')
    expect(nameSource).toBe('text_content')
  })

  it('extracts text from a aria-labelledby associated element', () => {
    const { name, nameSource } = getActionNameFromElement(
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
    expect(nameSource).toBe('text_content')
  })

  it('extracts text from multiple aria-labelledby associated elements', () => {
    const { name, nameSource } = getActionNameFromElement(
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
    expect(nameSource).toBe('text_content')
  })

  it('extracts text from a BUTTON element', () => {
    const { name, nameSource } = getActionNameFromElement(
      appendElement(`
      <div>
        <div>ignored</div>
        <button target>foo</button>
      </div>
    `),
      defaultConfiguration
    )
    expect(name).toBe('foo')
    expect(nameSource).toBe('text_content')
  })

  it('extracts text from a role=button element', () => {
    const { name, nameSource } = getActionNameFromElement(
      appendElement(`
      <div>
        <div>ignored</div>
        <div role="button" target>foo</div>
      </div>
    `),
      defaultConfiguration
    )
    expect(name).toBe('foo')
    expect(nameSource).toBe('text_content')
  })

  it('limits the recursion to the 10th parent', () => {
    const { name, nameSource } = getActionNameFromElement(
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
    expect(nameSource).toBe('blank')
  })

  it('limits the recursion to the BODY element', () => {
    const { name, nameSource } = getActionNameFromElement(
      appendElement(`
      <div>ignored</div>
      <i target></i>
    `),
      defaultConfiguration
    )
    expect(name).toBe('')
    expect(nameSource).toBe('blank')
  })

  it('limits the recursion to a FORM element', () => {
    const { name, nameSource } = getActionNameFromElement(
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
    expect(nameSource).toBe('blank')
  })

  it('extracts the { name, nameSource } from a parent FORM element', () => {
    const { name, nameSource } = getActionNameFromElement(
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
    expect(nameSource).toBe('standard_attribute')
  })

  it('extracts the whole textual content of a button', () => {
    const { name, nameSource } = getActionNameFromElement(
      appendElement(`
      <button>
        foo
        <i target>bar</i>
      </button>
    `),
      defaultConfiguration
    )
    expect(name).toBe('foo bar')
    expect(nameSource).toBe('text_content')
  })

  it('ignores the textual content of contenteditable elements', () => {
    const { name, nameSource } = getActionNameFromElement(
      appendElement(`
      <div contenteditable>
        <i target>ignored</i>
        ignored
      </div>
    `),
      defaultConfiguration
    )
    expect(name).toBe('')
    expect(nameSource).toBe('blank')
  })

  it('extracts the { name, nameSource } from attributes of contenteditable elements', () => {
    const { name, nameSource } = getActionNameFromElement(
      appendElement(`
      <div contenteditable>
        <i aria-label="foo" target>ignored</i>
        ignored
      </div>
    `),
      defaultConfiguration
    )
    expect(name).toBe('foo')
    expect(nameSource).toBe('standard_attribute')
  })

  it('computes an action name on SVG elements', () => {
    const { name, nameSource } = getActionNameFromElement(
      appendElement(`
       <button>
        foo <svg target></svg>
       <button>
    `),
      defaultConfiguration
    )
    expect(name).toBe('foo')
    expect(nameSource).toBe('text_content')
  })

  describe('programmatically declared action name', () => {
    it('extracts the name from the data-dd-action-name attribute', () => {
      const { name, nameSource } = getActionNameFromElement(
        appendElement(`
        <div data-dd-action-name="foo">ignored</div>
      `),
        defaultConfiguration
      )
      expect(name).toBe('foo')
      expect(nameSource).toBe('custom_attribute')
    })

    it('considers any parent', () => {
      const { name, nameSource } = getActionNameFromElement(
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
      expect(nameSource).toBe('custom_attribute')
    })

    it('normalizes the value', () => {
      const { name, nameSource } = getActionNameFromElement(
        appendElement(`
        <div data-dd-action-name="   foo  \t bar  ">ignored</div>
      `),
        defaultConfiguration
      )
      expect(name).toBe('foo bar')
      expect(nameSource).toBe('custom_attribute')
    })

    it('fallback on an automatic strategy if the attribute is empty', () => {
      const { name, nameSource } = getActionNameFromElement(
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
      expect(nameSource).toBe('text_content')
    })

    it('extracts the name from a user-configured attribute', () => {
      const { name, nameSource } = getActionNameFromElement(
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
      expect(nameSource).toBe('custom_attribute')
    })

    it('favors data-dd-action-name over user-configured attribute', () => {
      const { name, nameSource } = getActionNameFromElement(
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
      expect(nameSource).toBe('custom_attribute')
    })

    it('removes children with programmatic action name in textual content', () => {
      const { name, nameSource } = getActionNameFromElement(
        appendElement('<div>Foo <div data-dd-action-name="custom action">bar<div></div>'),
        defaultConfiguration
      )

      expect(name).toBe('Foo')
      expect(nameSource).toBe('text_content')
    })

    it('removes only the child with programmatic action name in textual content', () => {
      mockExperimentalFeatures([ExperimentalFeature.USE_TREE_WALKER_FOR_ACTION_NAME])
      const { name, nameSource } = getActionNameFromElement(
        appendElement('<div>Foobar Baz<div data-dd-action-name="custom action">bar<div></div>'),
        defaultConfiguration
      )
      expect(name).toBe('Foobar Baz')
      expect(nameSource).toBe('text_content')
    })

    it('remove children with programmatic action name in textual content based on the user-configured attribute', () => {
      const { name, nameSource } = getActionNameFromElement(
        appendElement('<div>Foo <div data-test-id="custom action">bar<div></div>'),
        {
          ...defaultConfiguration,
          actionNameAttribute: 'data-test-id',
        },
        undefined
      )
      expect(name).toBe('Foo')
      expect(nameSource).toBe('text_content')
    })
  })
  describe('with allowlist and enablePrivacyForActionName is true', () => {
    interface BrowserWindow extends Window {
      $DD_ALLOW?: Set<string>
    }

    it('preserves privacy level of the element when defaultPrivacyLevel is mask-unless-allowlisted', () => {
      mockExperimentalFeatures([ExperimentalFeature.USE_TREE_WALKER_FOR_ACTION_NAME])
      const { name, nameSource } = getActionNameFromElement(
        appendElement(`
        <div data-dd-privacy="mask">
          <span target>bar</span>
        </div>
      `),
        {
          ...defaultConfiguration,
          defaultPrivacyLevel: NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED,
          enablePrivacyForActionName: true,
        },
        NodePrivacyLevel.MASK
      )
      expect(name).toBe('Masked Element')
      expect(nameSource).toBe('mask_placeholder')
    })

    it('preserves privacy level of the element when node privacy level is mask-unless-allowlisted', () => {
      const testCases = [
        {
          html: `
           <div data-dd-privacy="mask-unless-allowlisted" target>
            <span>foo</span>
            <div data-dd-privacy="mask">
              <span>bar</span>
              <div data-dd-privacy="allow">
                <span>baz</span>
              </div>
            </div>
          </div>
          `,
          defaultPrivacyLevel: NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED,
          expectedName: '',
          expectedNameSource: 'blank',
        },
        {
          html: `
           <div data-dd-privacy="mask-unless-allowlisted" target>
            <span>foo</span>
            <div data-dd-privacy="mask">
              <span>bar</span>
              <div data-dd-privacy="allow">
                <span>baz</span>
              </div>
            </div>
          </div>
          `,
          defaultPrivacyLevel: NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED,
          allowlist: ['foo'],
          expectedName: 'foo',
          expectedNameSource: 'text_content',
        },
        {
          html: `
           <div data-dd-privacy="mask-unless-allowlisted" target>
            <span>foo</span>
            <div data-dd-privacy="allow">
              <span>baz</span>
            </div>
          </div>
          `,
          defaultPrivacyLevel: NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED,
          expectedName: 'baz',
          expectedNameSource: 'text_content',
        },
        {
          html: `
          <div data-dd-privacy="mask" target>
            <span>foo</span>
            <div data-dd-privacy="mask-unless-allowlisted">
              <span>bar</span>
              <div data-dd-privacy="allow">
                <span>baz</span>
              </div>
            </div>
          </div>
          `,
          defaultPrivacyLevel: NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED,
          expectedName: 'Masked Element',
          expectedNameSource: 'mask_placeholder',
        },
        {
          html: `
          <div data-dd-privacy="allow" target>
            <span>foo</span>
            <div data-dd-privacy="mask-unless-allowlisted">
              <span>bar</span>
              <div data-dd-privacy="allow">
                <span>baz</span>
              </div>
            </div>
          </div>
          `,
          defaultPrivacyLevel: NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED,
          expectedName: 'foo baz',
          expectedNameSource: 'text_content',
        },
        {
          html: `
          <div data-dd-privacy="allow" target>
            <span>foo</span>
            <div data-dd-privacy="mask-unless-allowlisted">
              <span>bar</span>
              <div data-dd-privacy="mask">
                <span>baz</span>
              </div>
            </div>
          </div>
          `,
          defaultPrivacyLevel: NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED,
          expectedName: 'foo',
          expectedNameSource: 'text_content',
        },
        {
          html: `
          <div data-dd-privacy="allow" target>
            <span>foo</span>
            <div data-dd-privacy="mask-unless-allowlisted">
              <span>bar</span>
              <div data-dd-privacy="allow">
                <span>baz</span>
              </div>
            </div>
          </div>
          `,
          defaultPrivacyLevel: NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED,
          allowlist: ['bar'],
          expectedName: 'foo bar baz',
          expectedNameSource: 'text_content',
        },
        {
          html: `
          <div data-dd-privacy="mask-unless-allowlisted" alt="bar" target>
            <span>bar</span>
          </div>
          `,
          defaultPrivacyLevel: NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED,
          expectedName: 'Masked Element',
          expectedNameSource: 'standard_attribute',
        },
        {
          html: `
          <div data-dd-privacy="mask-unless-allowlisted" alt="foo" target>
            <span>bar</span>
          </div>
          `,
          defaultPrivacyLevel: NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED,
          allowlist: ['foo'],
          expectedName: 'foo',
          expectedNameSource: 'standard_attribute',
        },
      ]
      testCases.forEach(({ html, defaultPrivacyLevel, allowlist, expectedName, expectedNameSource }) => {
        mockExperimentalFeatures([ExperimentalFeature.USE_TREE_WALKER_FOR_ACTION_NAME])
        ;(window as BrowserWindow).$DD_ALLOW = new Set(allowlist)
        const target = appendElement(html)
        const { name, nameSource } = getActionNameFromElement(
          target,
          {
            ...defaultConfiguration,
            defaultPrivacyLevel,
            enablePrivacyForActionName: true,
          },
          getNodeSelfPrivacyLevel(target)
        )
        expect(name).toBe(expectedName)
        expect(nameSource).toBe(expectedNameSource)
      })
    })
  })

  describe('with privacyEnabledForActionName', () => {
    it('extracts attribute text when privacyEnabledActionName is false', () => {
      const { name, nameSource } = getActionNameFromElement(
        appendElement(`
          <div data-dd-action-name="foo">
            <span target>ignored</span>
          </div>
    `),
        defaultConfiguration,
        NodePrivacyLevel.MASK
      )
      expect(name).toBe('foo')
      expect(nameSource).toBe('custom_attribute')
    })

    it('extracts user defined attribute text when privacyEnabledActionName is false', () => {
      const { name, nameSource } = getActionNameFromElement(
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
      expect(nameSource).toBe('custom_attribute')
    })

    it('extracts inner text when privacyEnabledActionName is false and custom action name set to empty', () => {
      const { name, nameSource } = getActionNameFromElement(
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
      expect(nameSource).toBe('text_content')
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
      ).toEqual({ name: 'Masked Element', nameSource: ActionNameSource.MASK_PLACEHOLDER })
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
      ).toEqual({ name: 'foo', nameSource: ActionNameSource.CUSTOM_ATTRIBUTE })
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
      ).toEqual({ name: 'foo', nameSource: ActionNameSource.CUSTOM_ATTRIBUTE })
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
        ).toEqual({ name: 'foo', nameSource: ActionNameSource.TEXT_CONTENT })
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
        ).toEqual({ name: 'Masked Element', nameSource: ActionNameSource.MASK_PLACEHOLDER })
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
        ).toEqual({ name: 'foo', nameSource: ActionNameSource.TEXT_CONTENT })
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
        ).toEqual({ name: 'bar foo', nameSource: ActionNameSource.TEXT_CONTENT })
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
        ).toEqual({ name: 'foo', nameSource: ActionNameSource.TEXT_CONTENT })
      })

      it('inherit privacy level and remove only the masked child', () => {
        mockExperimentalFeatures([ExperimentalFeature.USE_TREE_WALKER_FOR_ACTION_NAME])
        expect(
          getActionNameFromElement(
            appendElement(`
              <div class="dd-privacy-allow" target>
                bar secret
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
        ).toEqual({ name: 'bar secret foo', nameSource: ActionNameSource.TEXT_CONTENT })
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
        ).toEqual({ name: 'bar foo', nameSource: ActionNameSource.TEXT_CONTENT })
      })
    })
  })
})
