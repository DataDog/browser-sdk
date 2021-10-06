import { isIE } from '@datadog/browser-core'
import {
  NodePrivacyLevel,
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_ALLOW,
  PRIVACY_ATTR_VALUE_HIDDEN,
  PRIVACY_ATTR_VALUE_INPUT_IGNORED,
  PRIVACY_ATTR_VALUE_INPUT_MASKED,
} from '../../constants'
import {
  HTML,
  AST_ALLOW,
  AST_HIDDEN,
  AST_MASK,
  AST_MASK_USER_INPUT,
  generateLeanSerializedDoc,
} from '../../../test/htmlAst'
import { hasSerializedNode } from './serializationUtils'
import {
  serializeDocument,
  serializeNodeWithId,
  SerializeOptions,
  serializeDocumentNode,
  serializeChildNodes,
  serializeAttribute,
} from './serialize'
import { MAX_ATTRIBUTE_VALUE_CHAR_LENGTH } from './privacy'
import { ElementNode, NodeType } from './types'

const DEFAULT_OPTIONS: SerializeOptions = {
  document,
  parentNodePrivacyLevel: NodePrivacyLevel.ALLOW,
}

describe('serializeNodeWithId', () => {
  let sandbox: HTMLElement

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
    sandbox = document.createElement('div')
    sandbox.id = 'sandbox'
    document.body.appendChild(sandbox)
  })

  afterEach(() => {
    sandbox.remove()
  })

  describe('document serialization', () => {
    it('serializes a document', () => {
      const document = new DOMParser().parseFromString(`<!doctype html><html>foo</html>`, 'text/html')
      expect(serializeDocument(document, NodePrivacyLevel.ALLOW)).toEqual({
        type: NodeType.Document,
        childNodes: [
          jasmine.objectContaining({ type: NodeType.DocumentType, name: 'html', publicId: '', systemId: '' }),
          jasmine.objectContaining({ type: NodeType.Element, tagName: 'html' }),
        ],
        id: (jasmine.any(Number) as unknown) as number,
      })
    })
  })

  describe('elements serialization', () => {
    it('serializes a div', () => {
      expect(serializeNodeWithId(document.createElement('div'), DEFAULT_OPTIONS)).toEqual({
        type: NodeType.Element,
        tagName: 'div',
        attributes: {},
        isSVG: undefined,
        childNodes: [],
        id: (jasmine.any(Number) as unknown) as number,
      })
    })

    it('serializes hidden elements', () => {
      const element = document.createElement('div')
      element.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_HIDDEN)

      expect(serializeNodeWithId(element, DEFAULT_OPTIONS)).toEqual({
        type: NodeType.Element,
        tagName: 'div',
        attributes: {
          rr_width: '0px',
          rr_height: '0px',
          [PRIVACY_ATTR_NAME]: PRIVACY_ATTR_VALUE_HIDDEN,
        },
        isSVG: undefined,
        childNodes: [],
        id: (jasmine.any(Number) as unknown) as number,
      })
    })

    it('does not serialize hidden element children', () => {
      const element = document.createElement('div')
      element.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_HIDDEN)
      element.appendChild(document.createElement('hr'))
      expect((serializeNodeWithId(element, DEFAULT_OPTIONS)! as ElementNode).childNodes).toEqual([])
    })

    it('serializes attributes', () => {
      const element = document.createElement('div')
      element.setAttribute('foo', 'bar')
      element.setAttribute('data-foo', 'data-bar')
      element.className = 'zog'
      element.style.width = '10px'

      expect((serializeNodeWithId(element, DEFAULT_OPTIONS)! as ElementNode).attributes).toEqual({
        foo: 'bar',
        'data-foo': 'data-bar',
        class: 'zog',
        style: 'width: 10px;',
      })
    })

    it('serializes scroll position', () => {
      const element = document.createElement('div')
      Object.assign(element.style, { width: '100px', height: '100px', overflow: 'scroll' })
      const inner = document.createElement('div')
      Object.assign(inner.style, { width: '200px', height: '200px' })
      element.appendChild(inner)
      sandbox.appendChild(element)
      element.scrollBy(10, 20)

      expect((serializeNodeWithId(element, DEFAULT_OPTIONS)! as ElementNode).attributes).toEqual(
        jasmine.objectContaining({
          rr_scrollTop: 20,
          rr_scrollLeft: 10,
        })
      )
    })

    it('ignores white space in <head>', () => {
      const head = document.createElement('head')
      head.innerHTML = `  <title>  foo </title>  `

      expect((serializeNodeWithId(head, DEFAULT_OPTIONS)! as ElementNode).childNodes).toEqual([
        jasmine.objectContaining({
          type: NodeType.Element,
          tagName: 'title',
          childNodes: [jasmine.objectContaining({ type: NodeType.Text, textContent: '  foo ' })],
        }),
      ])
    })

    it('serializes <input> text elements value', () => {
      const input = document.createElement('input')
      input.value = 'toto'

      expect(serializeNodeWithId(input, DEFAULT_OPTIONS)! as ElementNode).toEqual(
        jasmine.objectContaining({
          attributes: { value: 'toto' },
        })
      )
    })

    it('serializes <textarea> elements value', () => {
      const textarea = document.createElement('textarea')
      textarea.value = 'toto'

      expect(serializeNodeWithId(textarea, DEFAULT_OPTIONS)! as ElementNode).toEqual(
        jasmine.objectContaining({
          attributes: { value: 'toto' },
        })
      )
    })

    it('serializes <select> elements value and selected state', () => {
      const select = document.createElement('select')
      const option1 = document.createElement('option')
      option1.value = 'foo'
      select.appendChild(option1)
      const option2 = document.createElement('option')
      option2.value = 'bar'
      select.appendChild(option2)
      select.options.selectedIndex = 1

      expect(serializeNodeWithId(select, DEFAULT_OPTIONS)! as ElementNode).toEqual(
        jasmine.objectContaining({
          attributes: { value: 'bar' },
          childNodes: [
            jasmine.objectContaining({
              attributes: {
                value: 'foo',
              },
            }),
            jasmine.objectContaining({
              attributes: {
                value: 'bar',
                selected: true,
              },
            }),
          ],
        })
      )
    })

    it('does not serialize <input type="password"> values set via property setter', () => {
      const input = document.createElement('input')
      input.type = 'password'
      input.value = 'toto'

      expect(serializeNodeWithId(input, DEFAULT_OPTIONS)! as ElementNode).toEqual(jasmine.objectContaining({}))
    })

    it('does not serialize <input type="password"> values set via attribute setter', () => {
      const input = document.createElement('input')
      input.type = 'password'
      input.setAttribute('value', 'toto')

      expect(serializeNodeWithId(input, DEFAULT_OPTIONS)! as ElementNode).toEqual(jasmine.objectContaining({}))
    })

    it('serializes <input type="checkbox"> elements checked state', () => {
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      expect(serializeNodeWithId(checkbox, DEFAULT_OPTIONS)! as ElementNode).toEqual(
        jasmine.objectContaining({
          attributes: {
            type: 'checkbox',
            value: 'on',
            checked: false,
          },
        })
      )

      checkbox.checked = true

      expect(serializeNodeWithId(checkbox, DEFAULT_OPTIONS)! as ElementNode).toEqual(
        jasmine.objectContaining({
          attributes: {
            type: 'checkbox',
            value: 'on',
            checked: true,
          },
        })
      )
    })

    it('serializes <audio> elements paused state', () => {
      const audio = document.createElement('audio')

      expect(serializeNodeWithId(audio, DEFAULT_OPTIONS)! as ElementNode).toEqual(
        jasmine.objectContaining({
          attributes: { rr_mediaState: 'paused' },
        })
      )

      // Emulate a playing audio file
      Object.defineProperty(audio, 'paused', { value: false })

      expect(serializeNodeWithId(audio, DEFAULT_OPTIONS)! as ElementNode).toEqual(
        jasmine.objectContaining({
          attributes: { rr_mediaState: 'played' },
        })
      )
    })

    describe('input privacy mode', () => {
      it('replaces <input> values with asterisks for masked mode', () => {
        const input = document.createElement('input')
        input.value = 'toto'
        input.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_INPUT_MASKED)

        expect(serializeNodeWithId(input, DEFAULT_OPTIONS)! as ElementNode).toEqual(
          jasmine.objectContaining({
            attributes: {
              [PRIVACY_ATTR_NAME]: PRIVACY_ATTR_VALUE_INPUT_MASKED,
              value: '***',
            },
          })
        )
      })

      it('respects ancestor privacy mode', () => {
        const parent = document.createElement('div')
        const input = document.createElement('input')
        input.value = 'toto'
        parent.appendChild(input)
        parent.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_INPUT_MASKED)

        expect((serializeNodeWithId(parent, DEFAULT_OPTIONS)! as ElementNode).childNodes[0]).toEqual(
          jasmine.objectContaining({
            attributes: { value: '***' },
          })
        )
      })
    })

    it('does serialize <input> values for ignored mode', () => {
      const input = document.createElement('input')
      input.value = 'toto'
      input.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_INPUT_IGNORED)

      expect(serializeNodeWithId(input, DEFAULT_OPTIONS)! as ElementNode).toEqual(
        jasmine.objectContaining({
          attributes: {
            [PRIVACY_ATTR_NAME]: PRIVACY_ATTR_VALUE_INPUT_IGNORED,
            value: '***',
          },
        })
      )
    })

    it('ignores the privacy mode for <input type="button">', () => {
      const button = document.createElement('input')
      button.type = 'button'
      button.value = 'toto'
      button.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_INPUT_IGNORED)

      expect((serializeNodeWithId(button, DEFAULT_OPTIONS)! as ElementNode).attributes.value).toEqual('toto')
    })

    it('ignores the privacy mode for <input type="submit">', () => {
      const button = document.createElement('input')
      button.type = 'submit'
      button.value = 'toto'
      button.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_INPUT_IGNORED)

      expect((serializeNodeWithId(button, DEFAULT_OPTIONS)! as ElementNode).attributes.value).toEqual('toto')
    })
  })

  describe('text nodes serialization', () => {
    it('serializes a text node', () => {
      const parentEl = document.createElement('bar')
      parentEl.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_ALLOW)
      const textNode = document.createTextNode('foo')
      parentEl.appendChild(textNode)
      expect(serializeNodeWithId(textNode, DEFAULT_OPTIONS)).toEqual({
        type: NodeType.Text,
        id: (jasmine.any(Number) as unknown) as number,
        isStyle: undefined,
        textContent: 'foo',
      })
    })

    it('does not serialize text nodes with only white space if the ignoreWhiteSpace option is specified', () => {
      expect(
        serializeNodeWithId(document.createTextNode('   '), { ...DEFAULT_OPTIONS, ignoreWhiteSpace: true })
      ).toEqual(null)
    })

    it('serializes a text node contained in a <style> element', () => {
      const style = document.createElement('style')
      style.textContent = 'body { background-color: red }'

      expect(serializeNodeWithId(style.childNodes[0], DEFAULT_OPTIONS)).toEqual(
        jasmine.objectContaining({
          textContent: 'body { background-color: red }',
          isStyle: true,
        })
      )
    })
  })

  describe('CDATA nodes serialization', () => {
    it('serializes a CDATA node', () => {
      const xmlDocument = new DOMParser().parseFromString('<root></root>', 'text/xml')
      expect(serializeNodeWithId(xmlDocument.createCDATASection('foo'), DEFAULT_OPTIONS)).toEqual({
        type: NodeType.CDATA,
        id: (jasmine.any(Number) as unknown) as number,
        textContent: '',
      })
    })
  })

  it('adds serialized node ids to the provided Set', () => {
    const serializedNodeIds = new Set<number>()
    const node = serializeNodeWithId(document.createElement('div'), { ...DEFAULT_OPTIONS, serializedNodeIds })!
    expect(serializedNodeIds).toEqual(new Set([node.id]))
  })

  describe('ignores some nodes', () => {
    it('does not save ignored nodes in the serializedNodeIds set', () => {
      const serializedNodeIds = new Set<number>()
      serializeNodeWithId(document.createElement('script'), { ...DEFAULT_OPTIONS, serializedNodeIds })
      expect(serializedNodeIds.size).toBe(0)
    })

    it('does not serialize ignored nodes', () => {
      const scriptElement = document.createElement('script')
      serializeNodeWithId(scriptElement, DEFAULT_OPTIONS)
      expect(hasSerializedNode(scriptElement)).toBe(false)
    })

    it('ignores script tags', () => {
      expect(serializeNodeWithId(document.createElement('script'), DEFAULT_OPTIONS)).toEqual(null)
    })

    it('ignores comments', () => {
      expect(serializeNodeWithId(document.createComment('foo'), DEFAULT_OPTIONS)).toEqual(null)
    })

    it('ignores link favicons', () => {
      const linkElement = document.createElement('link')
      linkElement.setAttribute('rel', 'shortcut icon')
      expect(serializeNodeWithId(linkElement, DEFAULT_OPTIONS)).toEqual(null)
    })

    it('ignores meta keywords', () => {
      const metaElement = document.createElement('meta')
      metaElement.setAttribute('name', 'keywords')
      expect(serializeNodeWithId(metaElement, DEFAULT_OPTIONS)).toEqual(null)
    })

    it('ignores meta name attribute casing', () => {
      const metaElement = document.createElement('meta')
      metaElement.setAttribute('name', 'KeYwOrDs')
      expect(serializeNodeWithId(metaElement, DEFAULT_OPTIONS)).toEqual(null)
    })
  })
})

describe('serializeDocumentNode handles', function testAllowDomTree() {
  const toJSONObj = (data: any) => JSON.parse(JSON.stringify(data)) as unknown

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
  })

  it('a masked DOM Document itself is still serialized ', () => {
    const serializeOptionsMask = {
      document,
      parentNodePrivacyLevel: NodePrivacyLevel.MASK,
    }
    expect(serializeDocumentNode(document, serializeOptionsMask)).toEqual({
      type: NodeType.Document,
      childNodes: serializeChildNodes(document, serializeOptionsMask),
    })
  })

  describe('for privacy tag `hidden`, a DOM tree', function testHiddenDomTree() {
    it('is serialized correctly', () => {
      const serializedDoc = generateLeanSerializedDoc(HTML, 'hidden')
      expect(toJSONObj(serializedDoc)).toEqual(AST_HIDDEN)
    })
  })

  describe('for privacy tag `mask`, a DOM tree', function testMaskDomTree() {
    it('is serialized correctly', () => {
      const serializedDoc = generateLeanSerializedDoc(HTML, 'mask')
      expect(toJSONObj(serializedDoc)).toEqual(AST_MASK)
    })
  })

  describe('for privacy tag `mask-user-input`, a DOM tree', function testMaskFormsOnlyDomTree() {
    it('is serialized correctly', () => {
      const serializedDoc = generateLeanSerializedDoc(HTML, 'mask-user-input')
      expect(toJSONObj(serializedDoc)).toEqual(AST_MASK_USER_INPUT)
    })
  })

  describe('for privacy tag `allow`, a DOM tree', function testAllowDomTree() {
    it('is serialized correctly', () => {
      const serializedDoc = generateLeanSerializedDoc(HTML, 'allow')
      expect(toJSONObj(serializedDoc)).toEqual(AST_ALLOW)
    })
  })
})

describe('serializeAttribute ', () => {
  it('truncates "data:" URIs after long string length', () => {
    const node = document.createElement('p')

    const longString = new Array(MAX_ATTRIBUTE_VALUE_CHAR_LENGTH + 1 - 5).join('a')
    const maxAttributeValue = `data:${longString}`
    const exceededAttributeValue = `data:${longString}1`
    const ignoredAttributeValue = `foos:${longString}`

    node.setAttribute('test-okay', maxAttributeValue)
    node.setAttribute('test-truncate', exceededAttributeValue)
    node.setAttribute('test-ignored', ignoredAttributeValue)

    expect(serializeAttribute(node, NodePrivacyLevel.ALLOW, 'test-okay')).toBe(maxAttributeValue)
    expect(serializeAttribute(node, NodePrivacyLevel.MASK, 'test-okay')).toBe(maxAttributeValue)

    expect(serializeAttribute(node, NodePrivacyLevel.MASK, 'test-ignored')).toBe(ignoredAttributeValue)

    expect(serializeAttribute(node, NodePrivacyLevel.ALLOW, 'test-truncate')).toBe('data:truncated')
    expect(serializeAttribute(node, NodePrivacyLevel.MASK, 'test-truncate')).toBe('data:truncated')
  })
})
