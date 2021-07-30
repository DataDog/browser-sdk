import { isIE } from '../../../../core/test/specHelper'
import { NodePrivacyLevelInternal, PRIVACY_ATTR_NAME } from '../../constants'
import * as utils from '../../../../core/src/tools/utils'
import { HTML, AST_ALLOW, AST_HIDDEN, AST_MASK, AST_MASK_FORMS_ONLY } from '../../../test/htmlAst'
import { SerializedNodeWithId, ElementNode, TextNode, NodeType } from './types'
import { getNodeSelfPrivacyLevel, derivePrivacyLevelGivenParent, scrambleText } from './privacy'
import { serializeDocument, serializeDocumentNode, serializeChildNodes } from './serialize'

if (!isIE()) {
  const getUniqueChars = (text: string) =>
    text
      .split('')
      .filter((char, index, array) => array.indexOf(char) === index)
      .join('')

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
      // eslint-disable-next-line no-console
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
        return textNode.childNodes.map((node: SerializedNodeWithId) => getTextNodesFromSerialized(node)).join(' ')
      }
      return ''
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('caught getTextNodesFromSerialized error:', e, serializedNode)
      return ''
    }
  }

  describe('Own Privacy Level', function testOWnPrivacyLevel() {
    // Simple Spec Entrance Tests
    it('classifies `allow` class', () => {
      const el = buildFromHTML('<span class="hi dd-privacy-allow" data-test="foo" bar="baz" checked>hello</span>')
      expect(getNodeSelfPrivacyLevel(el)).toBe(NodePrivacyLevelInternal.ALLOW)
    })
    it('classifies `hidden` class', () => {
      const el = buildFromHTML('<span class="hi dd-privacy-hidden" data-test="foo" bar="baz" checked>hello</span>')
      expect(getNodeSelfPrivacyLevel(el)).toBe(NodePrivacyLevelInternal.HIDDEN)
    })
    it('classifies `mask` class', () => {
      const el = buildFromHTML('<span class="hi dd-privacy-mask" data-test="foo" bar="baz" checked>hello</span>')
      expect(getNodeSelfPrivacyLevel(el)).toBe(NodePrivacyLevelInternal.MASK)
    })
    it('classifies `mask-forms-only` class', () => {
      const el = buildFromHTML(
        '<span class="hi dd-privacy-mask-forms-only" data-test="foo" bar="baz" checked>hello</span>'
      )
      expect(getNodeSelfPrivacyLevel(el)).toBe(NodePrivacyLevelInternal.MASK_FORMS_ONLY)
    })
    it('classifies deprecated `dd-privacy-input-ignored` class as `mask-forms-only`', () => {
      // eslint-disable-next-line max-len
      const el = buildFromHTML(
        '<span class="hi dd-privacy-input-ignored" data-test="foo" bar="baz" checked>hello</span>'
      )
      expect(getNodeSelfPrivacyLevel(el)).toBe(NodePrivacyLevelInternal.MASK_FORMS_ONLY)
    })
    it('classifies deprecated `dd-privacy-input-masked` class as `mask-forms-only`', () => {
      // eslint-disable-next-line max-len
      const el = buildFromHTML(
        '<span class="hi dd-privacy-input-masked" data-test="foo" bar="baz" checked>hello</span>'
      )
      expect(getNodeSelfPrivacyLevel(el)).toBe(NodePrivacyLevelInternal.MASK_FORMS_ONLY)
    })
    it('classifies deprecated `dd-privacy-foo` class as `NOT_SET`', () => {
      const el = buildFromHTML('<span class="hi dd-privacy-foo" data-test="foo" bar="baz" checked>hello</span>')
      expect(getNodeSelfPrivacyLevel(el)).toBe(NodePrivacyLevelInternal.NOT_SET)
    })
  })

  describe('Inherited Privacy Level:', function testWithInheritedPrivacyLevel() {
    describe(' derivePrivacyLevelGivenParent()', function testDerivePrivacyLevelGivenParent() {
      const tests = [
        {
          args: [NodePrivacyLevelInternal.ALLOW, 999],
          expect: NodePrivacyLevelInternal.ALLOW,
          msg: 'Robust against parent invalid',
        },
        {
          args: [999, NodePrivacyLevelInternal.ALLOW],
          expect: NodePrivacyLevelInternal.UNKNOWN,
          msg: 'Robust against self invalid',
        },
        { args: [999, 999], expect: NodePrivacyLevelInternal.UNKNOWN, msg: 'Robust against both invalid' },

        {
          args: [NodePrivacyLevelInternal.NOT_SET, NodePrivacyLevelInternal.UNKNOWN],
          expect: NodePrivacyLevelInternal.UNKNOWN,
          msg: 'Unknown not inherited',
        },
        {
          args: [NodePrivacyLevelInternal.UNKNOWN, NodePrivacyLevelInternal.NOT_SET],
          expect: NodePrivacyLevelInternal.UNKNOWN,
          msg: 'NOT_SET not inherited',
        },

        {
          args: [NodePrivacyLevelInternal.ALLOW, NodePrivacyLevelInternal.MASK],
          expect: NodePrivacyLevelInternal.ALLOW,
          msg: 'Override mask',
        },
        {
          args: [NodePrivacyLevelInternal.MASK, NodePrivacyLevelInternal.ALLOW],
          expect: NodePrivacyLevelInternal.MASK,
          msg: 'Override allow',
        },
        {
          args: [NodePrivacyLevelInternal.HIDDEN, NodePrivacyLevelInternal.ALLOW],
          expect: NodePrivacyLevelInternal.HIDDEN,
          msg: 'Override allow (for hidden)',
        },
        {
          args: [NodePrivacyLevelInternal.ALLOW, NodePrivacyLevelInternal.MASK_FORMS_ONLY],
          expect: NodePrivacyLevelInternal.ALLOW,
          msg: 'Override mask-forms-only',
        },

        {
          args: [NodePrivacyLevelInternal.MASK, NodePrivacyLevelInternal.HIDDEN],
          expect: NodePrivacyLevelInternal.HIDDEN,
          msg: 'Hidden is final',
        },
      ]

      tests.forEach((test) => {
        it(`${test.msg}: ancestor(${test.args[0]}) to self(${test.args[1]}) should be (${test.expect})`, () => {
          const inherited = derivePrivacyLevelGivenParent(
            test.args[0] as NodePrivacyLevelInternal,
            test.args[1] as NodePrivacyLevelInternal
          )
          expect(inherited).toBe(test.expect)
        })
      })
    })

    it('a masked or hidden DOM Document itself is still serialized ', () => {
      const serializeOptionsMask = {
        document,
        parentNodePrivacyLevel: NodePrivacyLevelInternal.MASK,
      }
      expect(serializeDocumentNode(document, serializeOptionsMask)).toEqual({
        type: NodeType.Document,
        childNodes: serializeChildNodes(document, serializeOptionsMask),
      })

      const serializeOptionsHidden = {
        document,
        parentNodePrivacyLevel: NodePrivacyLevelInternal.HIDDEN,
      }
      expect(serializeDocumentNode(document, serializeOptionsHidden)).toEqual({
        type: NodeType.Document,
        childNodes: serializeChildNodes(document, serializeOptionsHidden),
      })
    })

    const toJSONObj = (data: any) => JSON.parse(JSON.stringify(data)) as unknown

    describe('for privacy tag `hidden`, a DOM tree', function testHiddenDomTree() {
      const newDoc = makeHtmlDoc(HTML, 'hidden')
      const serializedDoc = removeIdFieldsRecursivelyClone(serializeDocument(newDoc)) as SerializedNodeWithId
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

    describe('for privacy tag `mask`, a DOM tree', function testMaskDomTree() {
      const newDoc = makeHtmlDoc(HTML, 'mask')
      const serializedDoc = removeIdFieldsRecursivelyClone(serializeDocument(newDoc)) as SerializedNodeWithId
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

    describe('for privacy tag `mask-forms-only`, a DOM tree', function testMaskFormsOnlyDomTree() {
      const newDoc = makeHtmlDoc(HTML, 'mask-forms-only')
      const serializedDoc = removeIdFieldsRecursivelyClone(serializeDocument(newDoc)) as SerializedNodeWithId
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

    describe('for privacy tag `allow`, a DOM tree', function testAllowDomTree() {
      const newDoc = makeHtmlDoc(HTML, 'allow')
      const serializedDoc = removeIdFieldsRecursivelyClone(serializeDocument(newDoc)) as SerializedNodeWithId
      it('is serialized correctly', () => {
        expect(toJSONObj(serializedDoc)).toEqual(AST_ALLOW)
      })

      it("doesn't have innerText alpha numberics", () => {
        const innerText = getTextNodesFromSerialized(serializedDoc)
        const privateWordMatchCount = innerText.match(/private/g)?.length
        expect(privateWordMatchCount).toBe(10)
        expect(innerText).toBe(
          // eslint-disable-next-line max-len
          '  \n      .example {content: "anything";}\n       private title \n \n     hello private world \n     Loreum ipsum private text \n     hello private world \n     \n      Click https://private.com/path/nested?query=param#hash\n     \n      \n     \n       private option A \n       private option B \n       private option C \n     \n      \n      \n      \n     inputFoo label \n\n      \n\n           Loreum Ipsum private ...\n     \n\n     editable private div \n'
        )
      })

      it('keeps innerText public', () => {
        expect(JSON.stringify(serializedDoc)).not.toContain('*')
        expect(JSON.stringify(serializedDoc)).not.toContain('xx')
      })
    })
  })

  describe('scrambleText()', function testScrambleText() {
    // eslint-disable-next-line max-len
    const loreumIpsum = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Fusce non tortor arcu. Nulla quis fermentum nunc. Integer eget nunc risus. Vestibulum a ante vel ipsum molestie mollis. In risus eros, venenatis at mauris quis, sollicitudin pulvinar dolor. Nulla fringilla est nec turpis luctus faucibus. Integer congue, libero et varius lacinia, ipsum sapien hendrerit est, sit amet tempus massa orci non enim.\nVivamus euismod risus non urna faucibus auctor. Donec est quam, iaculis ultrices felis vel, sollicitudin eleifend nisl. Donec sollicitudin nibh eget velit consectetur semper. Integer hendrerit ligula ac est cursus, eget posuere purus blandit. Duis dolor sem, congue non sodales ac, elementum eget lorem. Cras porttitor ac eros eu accumsan. Vivamus sit amet scelerisque urna, eget tincidunt sem. Maecenas finibus, nisl convallis condimentum luctus, elit nulla fringilla odio, sit amet dictum nulla ante id ante.\n\nCurabitur efficitur hendrerit facilisis. Sed volutpat lectus sed tortor fringilla lacinia. Praesent eu lectus varius augue gravida blandit. Sed elementum eget nisl ut feugiat. Curabitur vitae ex in elit sodales luctus sed nec purus. Morbi sit amet fermentum orci. Curabitur vestibulum congue tortor eget mattis.\n\nSed tincidunt elit lacus, at placerat mi luctus quis. Vestibulum a turpis id dolor semper congue. Maecenas semper, est sed scelerisque porta, turpis diam molestie odio, eget ultrices massa arcu at mi. Phasellus laoreet nisi quis tellus cursus, a imperdiet ante condimentum. Aliquam ut rutrum augue, eget rhoncus nunc. Maecenas et velit ac nisi pretium molestie eget vitae magna. Phasellus dapibus metus in ipsum condimentum, a varius arcu vehicula. In in iaculis ipsum, quis facilisis sem. Donec tortor tellus, malesuada id viverra ut, scelerisque ac nunc. Nullam lobortis rutrum nulla, ut tincidunt metus commodo at. Ut vitae lorem ex. Cras facilisis facilisis neque molestie tincidunt. Pellentesque pellentesque mi magna. Etiam eget neque vitae quam blandit commodo vel in sapien.`
    const scrambledText = scrambleText(loreumIpsum)

    it('maintains length', () => {
      expect(scrambledText.length).toBe(loreumIpsum.length)
    })
    it('is not censored', () => {
      expect(scrambledText).not.toContain('xxx')
    })
    it('generally maintains charset upperbound', () => {
      const loreumIpsumCharset = getUniqueChars(loreumIpsum)
      const scrambledLoreumIpsumCharset = getUniqueChars(scrambledText)
      // Upperbound charset is +1 because scrambling adds an asterisk
      expect(loreumIpsumCharset.length + 1).toBeGreaterThanOrEqual(scrambledLoreumIpsumCharset.length)
    })
    it('generally maintains charset lowerbound', () => {
      const loreumIpsumCharset = getUniqueChars(loreumIpsum)
      // Lower bound charset is rough because of randomly eliminated chars, so is possibly flakey
      const scrambledLoreumCharsetLengthSamples = new Array(100).fill(1).map(() => getUniqueChars(scrambledText).length)
      // eslint-disable-next-line prefer-spread
      const maxLoreumCharsetLength = Math.max.apply(Math, scrambledLoreumCharsetLengthSamples)
      expect(loreumIpsumCharset.length - 15).toBeLessThanOrEqual(maxLoreumCharsetLength)
      expect(maxLoreumCharsetLength).toBeGreaterThanOrEqual(20)
    })
  })
}
