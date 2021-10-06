import { isIE } from '@datadog/browser-core'
import { NodePrivacyLevel } from '../../constants'
import { HTML, generateLeanSerializedDoc } from '../../../test/htmlAst'
import { getNodeSelfPrivacyLevel, reducePrivacyLevel, getNodePrivacyLevel, shouldMaskNode } from './privacy'
import { ElementNode, NodeType, TextNode, SerializedNodeWithId } from './types'

describe('privacy helpers', () => {
  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
  })

  describe('for hiding blocks', () => {
    it('considers a normal DOM Element as not hidden', () => {
      const node = document.createElement('p')
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).not.toBe(NodePrivacyLevel.HIDDEN)
    })
    it('considers a DOM Element with a data-dd-privacy="hidden" attribute as hidden', () => {
      const node = document.createElement('p')
      node.setAttribute('data-dd-privacy', 'hidden')
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.HIDDEN)
    })
    it('considers a DOM Element with a data-dd-privacy="foo" attribute as not hidden', () => {
      const node = document.createElement('p')
      node.setAttribute('data-dd-privacy', 'foo')
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).not.toBe(NodePrivacyLevel.HIDDEN)
    })
    it('considers a DOM Element with a dd-privacy-hidden class as hidden', () => {
      const node = document.createElement('p')
      node.className = 'dd-privacy-hidden'
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.HIDDEN)
    })
    it('considers a normal DOM Element with a normal parent as not hidden', () => {
      const node = document.createElement('p')
      const parent = document.createElement('div')
      parent.appendChild(node)
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).not.toBe(NodePrivacyLevel.HIDDEN)
    })
    it('considers a DOM Element with a parent node with a dd-privacy="hidden" attribute as hidden', () => {
      const node = document.createElement('p')
      const parent = document.createElement('div')
      parent.setAttribute('data-dd-privacy', 'hidden')
      parent.appendChild(node)
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.HIDDEN)
    })
    it('considers a DOM Element with a parent node with a dd-privacy-hidden class as hidden', () => {
      const node = document.createElement('p')
      const parent = document.createElement('div')
      parent.className = 'dd-privacy-hidden'
      parent.appendChild(node)
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.HIDDEN)
    })
    it('considers a DOM Document as not hidden', () => {
      const isHidden = getNodePrivacyLevel(document, NodePrivacyLevel.ALLOW) === NodePrivacyLevel.HIDDEN
      expect(isHidden).toBeFalsy()
    })
  })

  describe('input privacy mode', () => {
    it('use the ancestor privacy mode for a normal DOM Element', () => {
      const node = document.createElement('div')
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.ALLOW)
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.IGNORE)).toBe(NodePrivacyLevel.IGNORE)
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.MASK)).toBe(NodePrivacyLevel.MASK)
    })

    it('use the ancestor privacy mode for a DOM Element with a data-dd-privacy="unknown-mode" attribute', () => {
      const node = document.createElement('input')
      node.setAttribute('data-dd-privacy', 'unknown-mode')
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.ALLOW)
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.IGNORE)).toBe(NodePrivacyLevel.IGNORE)
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.MASK)).toBe(NodePrivacyLevel.MASK)
    })

    it('use the ancestor privacy mode for a DOM HTMLInputElement with a type of "text"', () => {
      const node = document.createElement('input')
      node.type = 'text'
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.ALLOW)
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.IGNORE)).toBe(NodePrivacyLevel.IGNORE)
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.MASK)).toBe(NodePrivacyLevel.MASK)
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.MASK_USER_INPUT)).toBe(NodePrivacyLevel.MASK_USER_INPUT)
    })

    it('considers a DOM Element with a data-dd-privacy="input-ignored" attribute to be MASK_USER_INPUT (alias)', () => {
      const node = document.createElement('input')
      node.setAttribute('data-dd-privacy', 'input-ignored')
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.MASK_USER_INPUT)
    })

    it('considers a DOM Element with a dd-privacy-input-ignored class to be MASK_USER_INPUT (alias)', () => {
      const node = document.createElement('input')
      node.className = 'dd-privacy-input-ignored'
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.MASK_USER_INPUT)
    })

    it('considers a DOM HTMLInputElement with a type of "password" to be MASK_USER_INPUT (alias)', () => {
      const node = document.createElement('input')
      node.type = 'password'
      expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.MASK)
    })

    describe('input mode priority', () => {
      it('consider a DOM Element to be MASK_USER_INPUT if both modes can apply', () => {
        const node = document.createElement('input')
        node.className = 'dd-privacy-input-ignored'
        node.setAttribute('data-dd-privacy', 'mask-user-input')
        expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.MASK_USER_INPUT)
      })

      it('forces an element to be hidden if an ancestor is hidden', () => {
        const ancestor = document.createElement('div')
        ancestor.setAttribute('data-dd-privacy', 'hidden')
        const node = document.createElement('input')
        node.setAttribute('data-dd-privacy', 'input-masked')
        ancestor.appendChild(node)
        expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.HIDDEN)
      })

      it('forces an element to be ignored if an ancestor is MASK', () => {
        const ancestor = document.createElement('div')
        ancestor.setAttribute('data-dd-privacy', 'mask')
        const node = document.createElement('script')
        ancestor.appendChild(node)
        expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.IGNORE)
      })

      it('consider a DOM element to be ALLOW even if an ancestor is MASK', () => {
        const node = document.createElement('input')
        node.setAttribute('data-dd-privacy', 'allow')
        expect(getNodePrivacyLevel(node, NodePrivacyLevel.MASK_USER_INPUT)).toBe(NodePrivacyLevel.ALLOW)
      })
    })

    describe('walk through elements ancestors to determine the privacy mode', () => {
      it('considers a normal DOM Element with a normal parent as not to be ALLOW', () => {
        const node = document.createElement('input')
        const parent = document.createElement('form')
        parent.appendChild(node)
        expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.ALLOW)
      })

      it('considers DOM Element with parent node with dd-privacy="input-ignored" attr to be MASK_USER_INPUT', () => {
        const node = document.createElement('input')
        const parent = document.createElement('form')
        parent.setAttribute('data-dd-privacy', 'input-ignored')
        parent.appendChild(node)
        expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.MASK_USER_INPUT)
      })

      it('considers DOM Element with parent node with dd-privacy-input-ignored class to be MASK_USER_INPUT', () => {
        const node = document.createElement('input')
        const parent = document.createElement('form')
        parent.className = 'dd-privacy-input-ignored'
        parent.appendChild(node)
        expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.MASK_USER_INPUT)
      })

      // eslint-disable-next-line max-len
      it('considers a DOM Element with a "masked" privacy mode but within a parent with a "ignored" privacy mode to be MASK_USER_INPUT', () => {
        const node = document.createElement('input')
        const parent = document.createElement('form')
        parent.setAttribute('data-dd-privacy', 'input-ignored')
        parent.appendChild(node)
        node.setAttribute('data-dd-privacy', 'input-masked')
        expect(getNodePrivacyLevel(node, NodePrivacyLevel.ALLOW)).toBe(NodePrivacyLevel.MASK_USER_INPUT)
      })
    })
  })
})

const buildFromHTML = (html: string) => {
  const el = document.createElement('div')
  el.innerHTML = html
  return el.children[0]
}

describe('given privacy attributes getNodeSelfPrivacyLevel', function testOWnPrivacyLevel() {
  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
  })

  // Simple Spec Entrance Tests
  it('classifies `allow` class', () => {
    const el = buildFromHTML('<span class="hi dd-privacy-allow" data-test="foo" bar="baz" checked>hello</span>')
    expect(getNodeSelfPrivacyLevel(el)).toBe(NodePrivacyLevel.ALLOW)
  })
  it('classifies `hidden` class', () => {
    const el = buildFromHTML('<span class="hi dd-privacy-hidden" data-test="foo" bar="baz" checked>hello</span>')
    expect(getNodeSelfPrivacyLevel(el)).toBe(NodePrivacyLevel.HIDDEN)
  })
  it('classifies `mask` class', () => {
    const el = buildFromHTML('<span class="hi dd-privacy-mask" data-test="foo" bar="baz" checked>hello</span>')
    expect(getNodeSelfPrivacyLevel(el)).toBe(NodePrivacyLevel.MASK)
  })
  it('classifies `mask-user-input` class', () => {
    const el = buildFromHTML(
      '<span class="hi dd-privacy-mask-user-input" data-test="foo" bar="baz" checked>hello</span>'
    )
    expect(getNodeSelfPrivacyLevel(el)).toBe(NodePrivacyLevel.MASK_USER_INPUT)
  })
  it('classifies deprecated `dd-privacy-input-ignored` class as `mask-user-input`', () => {
    // eslint-disable-next-line max-len
    const el = buildFromHTML('<span class="hi dd-privacy-input-ignored" data-test="foo" bar="baz" checked>hello</span>')
    expect(getNodeSelfPrivacyLevel(el)).toBe(NodePrivacyLevel.MASK_USER_INPUT)
  })
  it('classifies deprecated `dd-privacy-input-masked` class as `mask-user-input`', () => {
    // eslint-disable-next-line max-len
    const el = buildFromHTML('<span class="hi dd-privacy-input-masked" data-test="foo" bar="baz" checked>hello</span>')
    expect(getNodeSelfPrivacyLevel(el)).toBe(NodePrivacyLevel.MASK_USER_INPUT)
  })
  it('classifies unknown class `dd-privacy-foo` class as undefined', () => {
    const el = buildFromHTML('<span class="hi dd-privacy-foo" data-test="foo" bar="baz" checked>hello</span>')
    expect(getNodeSelfPrivacyLevel(el)).toBe(undefined)
  })
})

describe('Inherited Privacy Level  derivePrivacyLevelGivenParent() ... ', function testWithInheritedPrivacyLevel() {
  const tests = [
    {
      args: [NodePrivacyLevel.ALLOW, 'CORRUPTED'],
      expect: NodePrivacyLevel.ALLOW,
      msg: 'Robust against parent invalid',
    },
    {
      args: ['CORRUPTED', NodePrivacyLevel.ALLOW],
      expect: NodePrivacyLevel.ALLOW,
      msg: 'Robust against self invalid',
    },
    {
      args: ['CORRUPTED_CHILD', 'CORRUPTED_PARENT'],
      expect: 'CORRUPTED_PARENT',
      msg: 'Fallback to parent if child is invalid',
    },
    {
      args: [NodePrivacyLevel.ALLOW, NodePrivacyLevel.MASK],
      expect: NodePrivacyLevel.ALLOW,
      msg: 'Override mask',
    },
    {
      args: [NodePrivacyLevel.MASK, NodePrivacyLevel.ALLOW],
      expect: NodePrivacyLevel.MASK,
      msg: 'Override allow',
    },
    {
      args: [NodePrivacyLevel.HIDDEN, NodePrivacyLevel.ALLOW],
      expect: NodePrivacyLevel.HIDDEN,
      msg: 'Override allow (for hidden)',
    },
    {
      args: [NodePrivacyLevel.ALLOW, NodePrivacyLevel.MASK_USER_INPUT],
      expect: NodePrivacyLevel.ALLOW,
      msg: 'Override mask-user-input',
    },

    {
      args: [NodePrivacyLevel.MASK, NodePrivacyLevel.HIDDEN],
      expect: NodePrivacyLevel.HIDDEN,
      msg: 'Hidden is final',
    },
  ]

  tests.forEach((test) => {
    it(`${test.msg}: ancestor(${test.args[0]}) to self(${test.args[1]}) should be (${test.expect})`, () => {
      const inherited = reducePrivacyLevel(test.args[0] as NodePrivacyLevel, test.args[1] as NodePrivacyLevel)
      expect(inherited).toBe(test.expect)
    })
  })
})

const getTextNodesFromSerialized = (serializedNode: SerializedNodeWithId | null): string => {
  try {
    if (serializedNode === null) {
      return ''
    } else if (serializedNode.type === NodeType.Text) {
      const textNode = serializedNode as TextNode
      return textNode.textContent
    } else if (serializedNode.type === NodeType.Element || serializedNode.type === NodeType.Document) {
      const textNode = serializedNode as ElementNode
      return textNode.childNodes.map((node: SerializedNodeWithId) => getTextNodesFromSerialized(node)).join(' ')
    }
    return ''
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('caught getTextNodesFromSerialized error:', e, serializedNode)
    return ''
  }
}

describe('serializeDocumentNode handles', function testAllowDomTree() {
  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
  })

  describe('for privacy tag `hidden`, a DOM tree', function testHiddenDomTree() {
    it('keeps private info private', () => {
      const serializedDoc = generateLeanSerializedDoc(HTML, 'hidden')
      expect(JSON.stringify(serializedDoc)).not.toContain('private')
    })
  })

  describe('for privacy tag `mask`, a DOM tree', function testMaskDomTree() {
    it("doesn't have innerText alpha numeric", () => {
      const serializedDoc = generateLeanSerializedDoc(HTML, 'mask')
      expect({ text: getTextNodesFromSerialized(serializedDoc) }).not.toBe({
        text: jasmine.stringMatching(/^[*x\s]+\.example {content: "anything";}[*x\s]+$/),
      })
    })

    it('keeps private info private', () => {
      const serializedDoc = generateLeanSerializedDoc(HTML, 'mask')
      expect(JSON.stringify(serializedDoc)).not.toContain('private')
    })
  })

  describe('for privacy tag `mask-user-input`, a DOM tree', function testMaskFormsOnlyDomTree() {
    it("doesn't mask text content", () => {
      const serializedDoc = generateLeanSerializedDoc(HTML, 'mask-user-input')
      expect(JSON.stringify(serializedDoc)).not.toContain('᙮᙮')
    })
    it('keeps form fields private', () => {
      const serializedDoc = generateLeanSerializedDoc(HTML, 'mask-user-input')
      expect(JSON.stringify(serializedDoc)).toContain('**')
    })
  })

  describe('for privacy tag `allow`, a DOM tree', function testAllowDomTree() {
    it("doesn't have innerText alpha numeric", () => {
      const serializedDoc = generateLeanSerializedDoc(HTML, 'allow')
      const innerText = getTextNodesFromSerialized(serializedDoc)
      const privateWordMatchCount = innerText.match(/private/g)?.length
      expect(privateWordMatchCount).toBe(10)
      expect(innerText).toBe(
        // eslint-disable-next-line max-len
        '  \n      .example {content: "anything";}\n       private title \n \n     hello private world \n     Loreum ipsum private text \n     hello private world \n     \n      Click https://private.com/path/nested?query=param#hash\n     \n      \n     \n       private option A \n       private option B \n       private option C \n     \n      \n      \n      \n     inputFoo label \n\n      \n\n           Loreum Ipsum private ...\n     \n\n     editable private div \n'
      )
    })

    it('keeps innerText public', () => {
      const serializedDoc = generateLeanSerializedDoc(HTML, 'allow')
      expect(JSON.stringify(serializedDoc)).not.toContain('*')
      expect(JSON.stringify(serializedDoc)).not.toContain('xx')
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
    })
  })

  describe('for text nodes contained in form elements', () => {
    it('returns true if the privacy level is MASK or MASK_USER_INPUT', () => {
      const element = document.createElement('input')
      const text = document.createTextNode('foo')
      element.appendChild(text)
      expect(shouldMaskNode(text, NodePrivacyLevel.MASK)).toBeTrue()
      expect(shouldMaskNode(text, NodePrivacyLevel.MASK_USER_INPUT)).toBeTrue()
    })
  })

  describe('for other elements', () => {
    it('returns false if the privacy level is ALLOW or MASK_USER_INPUT', () => {
      const element = document.createElement('div')
      expect(shouldMaskNode(element, NodePrivacyLevel.ALLOW)).toBeFalse()
      expect(shouldMaskNode(element, NodePrivacyLevel.MASK_USER_INPUT)).toBeFalse()
    })

    it('returns true if the privacy level is not ALLOW nor MASK_USER_INPUT', () => {
      const element = document.createElement('div')
      expect(shouldMaskNode(element, NodePrivacyLevel.MASK)).toBeTrue()
      expect(shouldMaskNode(element, NodePrivacyLevel.IGNORE)).toBeTrue()
      expect(shouldMaskNode(element, NodePrivacyLevel.HIDDEN)).toBeTrue()
    })
  })
})
