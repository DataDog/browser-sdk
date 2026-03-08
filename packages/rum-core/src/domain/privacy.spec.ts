import {
  NodePrivacyLevel,
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_HIDDEN,
  PRIVACY_ATTR_VALUE_MASK,
  PRIVACY_ATTR_VALUE_MASK_USER_INPUT,
} from './privacyConstants'
import {
  getNodeSelfPrivacyLevel,
  reducePrivacyLevel,
  getNodePrivacyLevel,
  shouldMaskNode,
  shouldMaskAttribute,
  maskDisallowedTextContent,
} from './privacy'
import { ACTION_NAME_MASK } from './action/actionNameConstants'
import { mockRumConfiguration } from '../../test'

describe('getNodePrivacyLevel', () => {
  it('returns the element privacy mode if it has one', () => {
    const node = document.createElement('div')
    node.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK)
    expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.MASK)
  })

  it('fallbacks to the default privacy mode if the element has none', () => {
    const node = document.createElement('div')
    expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.ALLOW)
    expect(getNodePrivacyLevel(node, NodePrivacyLevel.IGNORE)).toBe(NodePrivacyLevel.IGNORE)
    expect(getNodePrivacyLevel(node, NodePrivacyLevel.MASK)).toBe(NodePrivacyLevel.MASK)
    expect(getNodePrivacyLevel(node, NodePrivacyLevel.MASK_USER_INPUT)).toBe(NodePrivacyLevel.MASK_USER_INPUT)
    expect(getNodePrivacyLevel(node, NodePrivacyLevel.HIDDEN)).toBe(NodePrivacyLevel.HIDDEN)
    expect(getNodePrivacyLevel(node, NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED)).toBe(
      NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED
    )
  })

  describe('inheritance', () => {
    it('returns an ancestor privacy mode if the element has none', () => {
      const ancestor = document.createElement('div')
      const node = document.createElement('div')
      ancestor.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK)
      ancestor.appendChild(node)
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.MASK)
    })

    it('fallbacks to the default privacy mode if no ancestor has one', () => {
      const ancestor = document.createElement('div')
      const node = document.createElement('div')
      ancestor.appendChild(node)
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.ALLOW)
    })

    it('overrides the ancestor privacy mode', () => {
      const ancestor = document.createElement('div')
      ancestor.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK)
      const node = document.createElement('div')
      node.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT)
      ancestor.appendChild(node)
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.MASK_USER_INPUT)
    })

    it('does not override the ancestor privacy mode if it is HIDDEN', () => {
      const ancestor = document.createElement('div')
      ancestor.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_HIDDEN)
      const node = document.createElement('div')
      node.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT)
      ancestor.appendChild(node)
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.HIDDEN)
    })

    it('overrides the ancestor privacy mode if the element should be IGNORE', () => {
      const ancestor = document.createElement('div')
      ancestor.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK)
      const node = document.createElement('script')
      ancestor.appendChild(node)
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.IGNORE)
    })

    it('returns an ancestor privacy mode if the element has none and cross shadow DOM', () => {
      const ancestor = document.createElement('div')
      ancestor.attachShadow({ mode: 'open' })
      const node = document.createElement('div')
      ancestor.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK)
      ancestor.shadowRoot!.appendChild(node)
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.MASK)
    })
  })

  describe('cache', () => {
    it('fills the cache', () => {
      const ancestor = document.createElement('div')
      const node = document.createElement('div')
      ancestor.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK)
      ancestor.appendChild(node)

      const cache = new Map()
      getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW, cache)

      expect(cache.get(node)).toBe(NodePrivacyLevel.MASK)
    })

    it('uses the cache', () => {
      const ancestor = document.createElement('div')
      const node = document.createElement('div')
      ancestor.appendChild(node)

      const cache = new Map()
      cache.set(node, NodePrivacyLevel.MASK_USER_INPUT)

      expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW, cache)).toBe(NodePrivacyLevel.MASK_USER_INPUT)
    })

    it('does not recurse on ancestors if the node is already in the cache', () => {
      const ancestor = document.createElement('div')
      const node = document.createElement('div')
      ancestor.appendChild(node)

      const parentNodeGetterSpy = spyOnProperty(node, 'parentNode').and.returnValue(ancestor)

      const cache = new Map()
      cache.set(node, NodePrivacyLevel.MASK_USER_INPUT)

      getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW, cache)

      expect(parentNodeGetterSpy).not.toHaveBeenCalled()
    })
  })
})

describe('getNodeSelfPrivacyLevel', () => {
  ;[
    {
      msg: 'is not an element',
      html: 'foo',
      expected: undefined,
    },

    // Overrules
    {
      msg: 'has no privacy attribute or class',
      html: '<span>',
      expected: undefined,
    },
    {
      msg: 'is a "base" element (forced override)',
      html: '<base class="dd-privacy-mask">',
      expected: NodePrivacyLevel.ALLOW,
    },
    {
      msg: 'is an "input" element of type "password" (forced override)',
      html: '<input type="password" class="dd-privacy-allow">',
      expected: NodePrivacyLevel.MASK,
    },
    {
      msg: 'is an "input" element of type "tel" (forced override)',
      html: '<input type="tel" class="dd-privacy-allow">',
      expected: NodePrivacyLevel.MASK,
    },
    {
      msg: 'is an "input" element of type "email" (forced override)',
      html: '<input type="email" class="dd-privacy-allow">',
      expected: NodePrivacyLevel.MASK,
    },
    {
      msg: 'is an "input" element of type "hidden" (forced override)',
      html: '<input type="hidden" class="dd-privacy-allow">',
      expected: NodePrivacyLevel.MASK,
    },
    {
      msg: 'is an "input" element and has an autocomplete attribute starting with "cc-" (forced override)',
      html: '<input type="text" class="dd-privacy-allow" autocomplete="cc-foo">',
      expected: NodePrivacyLevel.MASK,
    },
    {
      msg: 'is an "input" element and has an autocomplete attribute ending with "-password" (forced override)',
      html: '<input type="text" class="dd-privacy-allow" autocomplete="foo-password">',
      expected: NodePrivacyLevel.MASK,
    },
    {
      msg: 'is an "input" element and has an autocomplete attribute not starting with "cc-"',
      html: '<input type="text" autocomplete="email">',
      expected: undefined,
    },

    // Class
    {
      msg: 'has a dd-privacy-allow class',
      html: '<span class="dd-privacy-allow">',
      expected: NodePrivacyLevel.ALLOW,
    },
    {
      msg: 'has a dd-privacy-hidden class',
      html: '<span class="dd-privacy-hidden">',
      expected: NodePrivacyLevel.HIDDEN,
    },
    {
      msg: 'has a dd-privacy-mask class',
      html: '<span class="dd-privacy-mask">',
      expected: NodePrivacyLevel.MASK,
    },
    {
      msg: 'has a dd-privacy-mask-user-input class',
      html: '<span class="dd-privacy-mask-user-input">',
      expected: NodePrivacyLevel.MASK_USER_INPUT,
    },
    {
      msg: 'has an unknown class starting with dd-privacy-',
      html: '<span class="dd-privacy-foo">',
      expected: undefined,
    },

    // Attributes
    {
      msg: 'has a data-dd-privacy="allow" attribute',
      html: '<span data-dd-privacy="allow">',
      expected: NodePrivacyLevel.ALLOW,
    },
    {
      msg: 'has a data-dd-privacy="hidden" attribute',
      html: '<span data-dd-privacy="hidden">',
      expected: NodePrivacyLevel.HIDDEN,
    },
    {
      msg: 'has a data-dd-privacy="mask" attribute',
      html: '<span data-dd-privacy="mask">',
      expected: NodePrivacyLevel.MASK,
    },
    {
      msg: 'has a data-dd-privacy="mask-user-input" attribute',
      html: '<span data-dd-privacy="mask-user-input">',
      expected: NodePrivacyLevel.MASK_USER_INPUT,
    },
    {
      msg: 'has an unknown data-dd-privacy attribute value',
      html: '<span data-dd-privacy="foo">',
      expected: undefined,
    },

    // Ignored elements
    {
      msg: 'should be ignored',
      html: '<script>',
      expected: NodePrivacyLevel.IGNORE,
    },
    {
      msg: 'should be ignored but has an ALLOW privacy class',
      html: '<script class="dd-privacy-allow">',
      expected: NodePrivacyLevel.ALLOW,
    },
    {
      msg: 'is a link with rel=preload and as=script',
      html: '<link rel="preload" crossorigins as="script">',
      expected: NodePrivacyLevel.IGNORE,
    },
    {
      msg: 'is a link with rel=modulepreload and as=script',
      html: '<link rel="modulepreload" as="script">',
      expected: NodePrivacyLevel.IGNORE,
    },
    {
      msg: 'is a link with rel=prefetch and as=script',
      html: '<link rel="prefetch" as="script">',
      expected: NodePrivacyLevel.IGNORE,
    },
    {
      msg: 'is a link with rel=stylesheet and a not expected as=script',
      html: '<link rel="stylesheet" as="script">',
      expected: undefined,
    },

    // Precedence
    {
      msg: 'has an ALLOW privacy class and a MASK privacy attribute (MASK takes precedence)',
      html: '<span data-dd-privacy="mask" class="dd-privacy-allow">',
      expected: NodePrivacyLevel.MASK,
    },
    {
      msg: 'has ALLOW and MASK_USER_INPUT privacy classes (MASK_USER_INPUT takes precedence)',
      html: '<span class="dd-privacy-allow dd-privacy-mask-user-input">',
      expected: NodePrivacyLevel.MASK_USER_INPUT,
    },
    {
      msg: 'has MASK_USER_INPUT and MASK privacy classes (MASK takes precedence)',
      html: '<span class="dd-privacy-mask-user-input dd-privacy-mask">',
      expected: NodePrivacyLevel.MASK,
    },
    {
      msg: 'has MASK and HIDDEN privacy classes (HIDDEN takes precedence)',
      html: '<span class="dd-privacy-mask dd-privacy-hidden">',
      expected: NodePrivacyLevel.HIDDEN,
    },
  ].forEach(({ msg, html, expected }) => {
    it(`returns ${String(expected)} when the node ${msg}`, () => {
      const el = document.createElement('div')
      el.innerHTML = html
      expect(getNodeSelfPrivacyLevel(el.childNodes[0])).toBe(expected)
    })
  })
})

describe('derivePrivacyLevelGivenParent', () => {
  const tests = [
    {
      parent: 'CORRUPTED',
      child: NodePrivacyLevel.ALLOW,
      expected: NodePrivacyLevel.ALLOW,
      msg: 'Robust against parent invalid',
    },
    {
      parent: NodePrivacyLevel.ALLOW,
      child: 'CORRUPTED',
      expected: NodePrivacyLevel.ALLOW,
      msg: 'Robust against child invalid',
    },
    {
      parent: 'CORRUPTED_PARENT',
      child: 'CORRUPTED_CHILD',
      expected: 'CORRUPTED_PARENT',
      msg: 'Fallback to parent if child is invalid',
    },
    {
      parent: NodePrivacyLevel.MASK,
      child: NodePrivacyLevel.ALLOW,
      expected: NodePrivacyLevel.ALLOW,
      msg: 'Override mask',
    },
    {
      parent: NodePrivacyLevel.ALLOW,
      child: NodePrivacyLevel.MASK,
      expected: NodePrivacyLevel.MASK,
      msg: 'Override allow',
    },
    {
      parent: NodePrivacyLevel.ALLOW,
      child: NodePrivacyLevel.HIDDEN,
      expected: NodePrivacyLevel.HIDDEN,
      msg: 'Override allow (for hidden)',
    },
    {
      parent: NodePrivacyLevel.MASK_USER_INPUT,
      child: NodePrivacyLevel.ALLOW,
      expected: NodePrivacyLevel.ALLOW,
      msg: 'Override mask-user-input',
    },

    {
      parent: NodePrivacyLevel.HIDDEN,
      child: NodePrivacyLevel.MASK,
      expected: NodePrivacyLevel.HIDDEN,
      msg: 'Hidden is final',
    },
    {
      parent: NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED,
      child: NodePrivacyLevel.ALLOW,
      expected: NodePrivacyLevel.ALLOW,
      msg: 'Override mask-unless-allowlisted (for allow)',
    },
    {
      parent: NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED,
      child: NodePrivacyLevel.MASK,
      expected: NodePrivacyLevel.MASK,
      msg: 'Override mask-unless-allowlisted (for mask)',
    },
    {
      parent: NodePrivacyLevel.ALLOW,
      child: NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED,
      expected: NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED,
      msg: 'Override allow (for mask-unless-allowlisted)',
    },
    {
      parent: NodePrivacyLevel.MASK,
      child: NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED,
      expected: NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED,
      msg: 'Override mask (for mask-unless-allowlisted)',
    },
    {
      parent: NodePrivacyLevel.HIDDEN,
      child: NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED,
      expected: NodePrivacyLevel.HIDDEN,
      msg: 'Hidden is final (for mask-unless-allowlisted)',
    },
  ]

  tests.forEach(({ parent, child, expected, msg }) => {
    it(`${msg}: parent(${parent}) to child(${child}) should be (${expected})`, () => {
      expect(reducePrivacyLevel(child as NodePrivacyLevel, parent as NodePrivacyLevel)).toBe(expected)
    })
  })
})

describe('shouldMaskNode', () => {
  describe('for form elements', () => {
    it('returns false if the privacy level is ALLOW', () => {
      const element = document.createElement('input')
      expect(shouldMaskNode(element, NodePrivacyLevel.ALLOW)).toBeFalse()
    })

    it('returns true if the privacy level is not ALLOW', () => {
      const element = document.createElement('input')
      expect(shouldMaskNode(element, NodePrivacyLevel.MASK)).toBeTrue()
      expect(shouldMaskNode(element, NodePrivacyLevel.MASK_USER_INPUT)).toBeTrue()
      expect(shouldMaskNode(element, NodePrivacyLevel.IGNORE)).toBeTrue()
      expect(shouldMaskNode(element, NodePrivacyLevel.HIDDEN)).toBeTrue()
      expect(shouldMaskNode(element, NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED)).toBeTrue()
    })
  })

  describe('for text nodes contained in form elements', () => {
    it('returns true if the privacy level is MASK or MASK_USER_INPUT or MASK_UNLESS_ALLOWLISTED', () => {
      const element = document.createElement('input')
      const text = document.createTextNode('foo')
      element.appendChild(text)
      expect(shouldMaskNode(text, NodePrivacyLevel.MASK)).toBeTrue()
      expect(shouldMaskNode(text, NodePrivacyLevel.MASK_USER_INPUT)).toBeTrue()
      expect(shouldMaskNode(text, NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED)).toBeTrue()
    })
  })

  describe('for other elements', () => {
    it('returns false if the privacy level is ALLOW or MASK_USER_INPUT', () => {
      const element = document.createElement('div')
      expect(shouldMaskNode(element, NodePrivacyLevel.ALLOW)).toBeFalse()
      expect(shouldMaskNode(element, NodePrivacyLevel.MASK_USER_INPUT)).toBeFalse()
    })

    it('returns true if the privacy level is not ALLOW nor MASK_USER_INPUT nor MASK_UNLESS_ALLOWLISTED', () => {
      const element = document.createElement('div')
      expect(shouldMaskNode(element, NodePrivacyLevel.MASK)).toBeTrue()
      expect(shouldMaskNode(element, NodePrivacyLevel.IGNORE)).toBeTrue()
      expect(shouldMaskNode(element, NodePrivacyLevel.HIDDEN)).toBeTrue()
    })

    describe('when privacy level is MASK_UNLESS_ALLOWLISTED', () => {
      beforeEach(() => {
        // Reset allowlist before each test
        delete (window as any).$DD_ALLOW
      })

      describe('for text nodes', () => {
        let textNode: Text

        beforeEach(() => {
          textNode = document.createTextNode('')
        })

        it('returns false for allowlisted text content', () => {
          const allowedText = 'allowed text'
          textNode.textContent = allowedText
          ;(window as any).$DD_ALLOW = new Set([allowedText.toLocaleLowerCase()])
          expect(shouldMaskNode(textNode, NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED)).toBeFalse()
        })

        it('returns false for whitespace-only text content', () => {
          textNode.textContent = '   \n\t  '
          expect(shouldMaskNode(textNode, NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED)).toBeFalse()
        })

        it('returns true for non-allowlisted, non-whitespace text content', () => {
          textNode.textContent = 'some text'
          expect(shouldMaskNode(textNode, NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED)).toBeTrue()
        })

        it('returns true if text node is child of a form element regardless of allowlist', () => {
          const input = document.createElement('input')
          textNode.textContent = 'some text'
          input.appendChild(textNode)
          ;(window as any).$DD_ALLOW = new Set(['some text'])
          expect(shouldMaskNode(textNode, NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED)).toBeTrue()
        })
      })

      describe('for non-text nodes', () => {
        it('returns true for form elements', () => {
          const input = document.createElement('input')
          expect(shouldMaskNode(input, NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED)).toBeTrue()

          const textarea = document.createElement('textarea')
          expect(shouldMaskNode(textarea, NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED)).toBeTrue()
        })

        it('returns false for non-form elements', () => {
          const div = document.createElement('div')
          expect(shouldMaskNode(div, NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED)).toBeFalse()

          const span = document.createElement('span')
          expect(shouldMaskNode(span, NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED)).toBeFalse()
        })
      })
    })
  })
})

describe('shouldMaskAttribute', () => {
  it('does not mask attributes in attrUnmaskAllowlist when privacy level is MASK', () => {
    const configuration = mockRumConfiguration({ attrUnmaskAllowlist: ['title', 'data-testid'] })
    expect(
      shouldMaskAttribute('DIV', 'title', 'some title', NodePrivacyLevel.MASK, configuration)
    ).toBeFalse()
    expect(
      shouldMaskAttribute('DIV', 'data-testid', 'my-element', NodePrivacyLevel.MASK, configuration)
    ).toBeFalse()
  })

  it('does not mask attributes in attrUnmaskAllowlist when privacy level is MASK_UNLESS_ALLOWLISTED', () => {
    const configuration = mockRumConfiguration({ attrUnmaskAllowlist: ['alt', 'placeholder'] })
    expect(
      shouldMaskAttribute('IMG', 'alt', 'description', NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED, configuration)
    ).toBeFalse()
    expect(
      shouldMaskAttribute('INPUT', 'placeholder', 'Enter text', NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED, configuration)
    ).toBeFalse()
  })

  it('masks attributes not in allowlist according to normal rules when privacy level is MASK', () => {
    const configuration = mockRumConfiguration({ attrUnmaskAllowlist: ['data-allowlisted'] })
    expect(shouldMaskAttribute('DIV', 'title', 'secret', NodePrivacyLevel.MASK, configuration)).toBeTrue()
    expect(shouldMaskAttribute('A', 'href', 'https://example.com', NodePrivacyLevel.MASK, configuration)).toBeTrue()
    expect(
      shouldMaskAttribute('DIV', 'data-allowlisted', 'value', NodePrivacyLevel.MASK, configuration)
    ).toBeFalse()
  })

  it('preserves default masking behavior when attrUnmaskAllowlist is empty', () => {
    const configuration = mockRumConfiguration({ attrUnmaskAllowlist: [] })
    expect(shouldMaskAttribute('DIV', 'title', 'secret', NodePrivacyLevel.MASK, configuration)).toBeTrue()
    expect(shouldMaskAttribute('IMG', 'alt', 'desc', NodePrivacyLevel.MASK, configuration)).toBeTrue()
    expect(shouldMaskAttribute('A', 'href', 'https://x.com', NodePrivacyLevel.MASK, configuration)).toBeTrue()
  })

  it('does not mask standard sensitive attributes when they are in allowlist', () => {
    const configuration = mockRumConfiguration({
      attrUnmaskAllowlist: ['title', 'alt', 'placeholder', 'aria-label', 'name', 'href', 'srcdoc', 'src'],
    })
    expect(shouldMaskAttribute('DIV', 'title', 'visible', NodePrivacyLevel.MASK, configuration)).toBeFalse()
    expect(shouldMaskAttribute('IMG', 'alt', 'visible', NodePrivacyLevel.MASK, configuration)).toBeFalse()
    expect(shouldMaskAttribute('INPUT', 'placeholder', 'visible', NodePrivacyLevel.MASK, configuration)).toBeFalse()
    expect(shouldMaskAttribute('DIV', 'aria-label', 'visible', NodePrivacyLevel.MASK, configuration)).toBeFalse()
    expect(shouldMaskAttribute('INPUT', 'name', 'visible', NodePrivacyLevel.MASK, configuration)).toBeFalse()
    expect(shouldMaskAttribute('A', 'href', 'https://example.com', NodePrivacyLevel.MASK, configuration)).toBeFalse()
    expect(shouldMaskAttribute('IFRAME', 'srcdoc', '<p>html</p>', NodePrivacyLevel.MASK, configuration)).toBeFalse()
    expect(shouldMaskAttribute('IMG', 'src', 'https://img.com/x.png', NodePrivacyLevel.MASK, configuration)).toBeFalse()
  })
})

const TEST_STRINGS = {
  COMPLEX_MIXED: 'test-team-name:💥$$$',
  PARAGRAPH_MIXED: '✅ This is an action name in allowlist',
}

describe('maskWithAllowlist', () => {
  interface BrowserWindow extends Window {
    $DD_ALLOW?: Set<string>
  }

  beforeEach(() => {
    ;(window as BrowserWindow).$DD_ALLOW = new Set([TEST_STRINGS.PARAGRAPH_MIXED])
  })

  afterEach(() => {
    ;(window as BrowserWindow).$DD_ALLOW = undefined
  })

  it('should fail closed if $DD_ALLOW is not defined', () => {
    ;(window as BrowserWindow).$DD_ALLOW = undefined
    const testString = maskDisallowedTextContent('mask-feature-on', ACTION_NAME_MASK)
    expect(testString).toBe(ACTION_NAME_MASK)
  })

  it('masks text content not in allowlist (with dictionary from $DD_ALLOW)', () => {
    const testString = maskDisallowedTextContent('any unallowed string', ACTION_NAME_MASK)
    expect(testString).toBe(ACTION_NAME_MASK)
  })

  it('does not mask text content if it is in allowlist', () => {
    const testString = maskDisallowedTextContent(TEST_STRINGS.COMPLEX_MIXED, ACTION_NAME_MASK)
    expect(testString).toBe('xxx')
  })

  it('handles empty string', () => {
    const result = maskDisallowedTextContent('', ACTION_NAME_MASK)
    expect(result).toBe('')
  })

  it('handles whitespace-only string', () => {
    const result = maskDisallowedTextContent('   \n\t  ', ACTION_NAME_MASK)
    expect(result).toBe('   \n\t  ')
  })
})
