import { SerializedNodeWithId } from 'packages/rum-recorder/src/domain/record/types'
import { NodePrivacyLevel, PRIVACY_ATTR_NAME } from '../../constants'
import * as utils from '../../../../core/src/tools/utils'
import { HTML, AST_ALLOW, AST_HIDDEN, AST_MASK, AST_MASK_FORMS_ONLY } from '../../../test/htmlAst'
import { getNodeSelfPrivacyLevel, _derivePrivacyLevelGivenParent } from './privacy'
import { serializeDocument } from './serialize'
import { ElementNode, TextNode, NodeType } from './types'

const buildFromHTML = (html: string) => {
  const el = document.createElement('div')
  el.innerHTML = html
  return el.children[0]
}

const removeIdFieldsRecursivelyClone = (thing: Record<string, unknown>): Record<string, unknown> => {
  if (thing && typeof thing === 'object') {
    const object = thing
    delete object.id
    utils.objectValues(object).forEach((value) => removeIdFieldsRecursivelyClone(value as Record<string, unknown>))
    return object
  }
  return thing
}

const makeHtmlDoc = (HtmlContent: string, privacyTag: string) => {
  try {
    // Karma doesn't seem to support `document.documentElement.outerHTML`
    const newDoc = document.implementation.createHTMLDocument('new doc')
    newDoc.documentElement.innerHTML = HtmlContent
    newDoc.documentElement.setAttribute(PRIVACY_ATTR_NAME, privacyTag)
    return newDoc
  } catch (e) {
    console.error('Failed to set innerHTML of new doc:', e)
    return document
  }
}

const getTextNodesFromSerialized = (serializedNode: SerializedNodeWithId | null): string => {
  try {
    if (serializedNode === null) {
      return ''
    } else if (serializedNode.type === NodeType.Text) {
      const textNode = serializedNode as TextNode
      return textNode.textContent
    } else if (serializedNode.type === NodeType.Element || serializedNode.type === NodeType.Document) {
      const textNode = serializedNode as ElementNode
      return textNode.childNodes
        .map(
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          (node: SerializedNodeWithId) => getTextNodesFromSerialized(node)
        )
        .join(' ')
    }
    return ''
  } catch (e) {
    console.error('caught getTextNodesFromSerialized error:', e)
    return ''
  }
}

describe('Self Privacy Level', () => {
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
  it('classifies `mask-forms-only` class', () => {
    const el = buildFromHTML(
      '<span class="hi dd-privacy-mask-forms-only" data-test="foo" bar="baz" checked>hello</span>'
    )
    expect(getNodeSelfPrivacyLevel(el)).toBe(NodePrivacyLevel.MASK_FORMS_ONLY)
  })
  it('classifies deprecated `dd-privacy-input-ignored` class as `mask-forms-only`', () => {
    const el = buildFromHTML('<span class="hi dd-privacy-input-ignored" data-test="foo" bar="baz" checked>hello</span>')
    expect(getNodeSelfPrivacyLevel(el)).toBe(NodePrivacyLevel.MASK_FORMS_ONLY)
  })
  it('classifies deprecated `dd-privacy-input-masked` class as `mask-forms-only`', () => {
    const el = buildFromHTML('<span class="hi dd-privacy-input-masked" data-test="foo" bar="baz" checked>hello</span>')
    expect(getNodeSelfPrivacyLevel(el)).toBe(NodePrivacyLevel.MASK_FORMS_ONLY)
  })
  it('classifies deprecated `dd-privacy-foo` class as `NOT_SET`', () => {
    const el = buildFromHTML('<span class="hi dd-privacy-foo" data-test="foo" bar="baz" checked>hello</span>')
    expect(getNodeSelfPrivacyLevel(el)).toBe(NodePrivacyLevel.NOT_SET)
  })
})

describe('Inherited Privacy Level', () => {
  // Simple Spec Smoke Tests
  const tests = [
    // {args: [undefined, undefined], expect: NodePrivacyLevel.UNKNOWN, msg: 'Fallback to unknown'},
    // {args: [NodePrivacyLevel.ALLOW, undefined], expect: NodePrivacyLevel.ALLOW, msg: 'Robust against undefined'},
    { args: [NodePrivacyLevel.ALLOW, 999], expect: NodePrivacyLevel.ALLOW, msg: 'Robust against parent invalid' },
    { args: [999, NodePrivacyLevel.ALLOW], expect: NodePrivacyLevel.UNKNOWN, msg: 'Robust against self invalid' },
    { args: [999, 999], expect: NodePrivacyLevel.UNKNOWN, msg: 'Robust against both invalid' },

    {
      args: [NodePrivacyLevel.NOT_SET, NodePrivacyLevel.UNKNOWN],
      expect: NodePrivacyLevel.UNKNOWN,
      msg: 'Unknown not inherited',
    },
    {
      args: [NodePrivacyLevel.UNKNOWN, NodePrivacyLevel.NOT_SET],
      expect: NodePrivacyLevel.UNKNOWN,
      msg: 'NOT_SET not inherited',
    },

    { args: [NodePrivacyLevel.ALLOW, NodePrivacyLevel.MASK], expect: NodePrivacyLevel.ALLOW, msg: 'Override mask' },
    { args: [NodePrivacyLevel.MASK, NodePrivacyLevel.ALLOW], expect: NodePrivacyLevel.MASK, msg: 'Override allow' },
    {
      args: [NodePrivacyLevel.HIDDEN, NodePrivacyLevel.ALLOW],
      expect: NodePrivacyLevel.HIDDEN,
      msg: 'Override allow (for hidden)',
    },
    {
      args: [NodePrivacyLevel.ALLOW, NodePrivacyLevel.MASK_FORMS_ONLY],
      expect: NodePrivacyLevel.ALLOW,
      msg: 'Override mask-forms-only',
    },

    {
      args: [NodePrivacyLevel.MASK, NodePrivacyLevel.HIDDEN],
      expect: NodePrivacyLevel.HIDDEN,
      msg: 'Hidden is final',
    },
    {
      args: [NodePrivacyLevel.MASK, NodePrivacyLevel.MASK_SEALED],
      expect: NodePrivacyLevel.MASK_SEALED,
      msg: 'Mask-sealed is final',
    },
    {
      args: [NodePrivacyLevel.MASK, NodePrivacyLevel.MASK_FORMS_ONLY_SEALED],
      expect: NodePrivacyLevel.MASK_FORMS_ONLY_SEALED,
      msg: 'Mask-forms-only-sealed is final',
    },
  ]

  tests.forEach((test) => {
    it(`${test.msg}: ancestor(${test.args[0]}) to self(${test.args[1]}) should be (${test.expect})`, () => {
      const inherited = _derivePrivacyLevelGivenParent(test.args[0], test.args[1])
      expect(inherited).toBe(test.expect)
    })
  })
})

describe('Inherited Privacy Level', () => {
  const toJSONObj = (data: any) => JSON.parse(JSON.stringify(data)) as unknown

  describe('for privacy tag `hidden`, a DOM tree', () => {
    const newDoc = makeHtmlDoc(HTML, 'hidden')
    const serializedDoc = removeIdFieldsRecursivelyClone(serializeDocument(newDoc)) as SerializedNodeWithId
    // console.log(JSON.stringify(serializedDoc,null,2));
    it('is serialized correctly', () => {
      expect(toJSONObj(serializedDoc)).toEqual(AST_HIDDEN)
    })
    it('has no children in <HTML>', () => {
      expect((serializedDoc as any).childNodes[1].childNodes.length).toBe(0)
    })
    it('keeps private info private', () => {
      expect(JSON.stringify(serializedDoc)).not.toContain('private')
    })
  })

  describe('for privacy tag `mask`, a DOM tree', () => {
    const newDoc = makeHtmlDoc(HTML, 'mask')
    // console.log(JSON.stringify(serializeDocument(newDoc), null, 2));
    const serializedDoc = removeIdFieldsRecursivelyClone(serializeDocument(newDoc)) as SerializedNodeWithId
    // console.log(JSON.stringify(serializedDoc,null,2));
    // debugger;
    it('is serialized correctly', () => {
      expect(toJSONObj(serializedDoc)).toEqual(AST_MASK)
    })

    it("doesn't have innerText alpha numberics", () => {
      expect({ text: getTextNodesFromSerialized(serializedDoc) }).not.toBe({
        text: jasmine.stringMatching(/^[*᙮\s]+\.example {content: "anything";}[*᙮\s]+$/),
      })
    })

    it('keeps private info private', () => {
      expect(JSON.stringify(serializedDoc)).not.toContain('private')
    })
  })

  describe('for privacy tag `mask-forms-only`, a DOM tree', () => {
    const newDoc = makeHtmlDoc(HTML, 'mask-forms-only')
    const serializedDoc = removeIdFieldsRecursivelyClone(serializeDocument(newDoc)) as SerializedNodeWithId
    // console.log(JSON.stringify(serializedDoc,null,2));
    it('is serialized correctly', () => {
      expect(toJSONObj(serializedDoc)).toEqual(AST_MASK_FORMS_ONLY)
    })

    it('doesnt mask text content', () => {
      expect(JSON.stringify(serializedDoc)).not.toContain('xx')
    })
    it('keeps form fields private', () => {
      expect(JSON.stringify(serializedDoc)).toContain('**')
    })
  })

  describe('for privacy tag `allow`, a DOM tree', () => {
    const newDoc = makeHtmlDoc(HTML, 'allow')
    const serializedDoc = removeIdFieldsRecursivelyClone(serializeDocument(newDoc)) as SerializedNodeWithId
    // console.log(JSON.stringify(serializedDoc,null,2));
    it('is serialized correctly', () => {
      expect(toJSONObj(serializedDoc)).toEqual(AST_ALLOW)
    })

    it("doesn't have innerText alpha numberics", () => {
      const innerText = getTextNodesFromSerialized(serializedDoc)
      const privateWordMatchCount = innerText.match(/private/g)?.length
      expect(privateWordMatchCount).toBe(10)
      // console.log(JSON.stringify(innerText));
      expect(innerText).toBe(
        // eslint-disable-next-line max-len
        '  \n      .example {content: "anything";}\n       private title \n \n     hello private world \n     Loreum ipsum private text \n     hello  private  world \n     \n      Click https://private.com/path/nested?query=param#hash\n     \n      \n     private option A private option B private option C \n      \n      \n      \n     inputFoo label \n\n      \n\n           Loreum Ipsum private ...\n     \n\n     editable private div \n'
      )
    })

    it('keeps innerText public', () => {
      expect(JSON.stringify(serializedDoc)).not.toContain('*')
      expect(JSON.stringify(serializedDoc)).not.toContain('xx')
    })
  })
})
