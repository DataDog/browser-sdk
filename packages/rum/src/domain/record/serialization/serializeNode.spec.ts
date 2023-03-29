import { isIE, noop } from '@datadog/browser-core'

import type { RumConfiguration } from '@datadog/browser-rum-core'
import { isAdoptedStyleSheetsSupported } from '@datadog/browser-core/test'
import {
  NodePrivacyLevel,
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_ALLOW,
  PRIVACY_ATTR_VALUE_HIDDEN,
  PRIVACY_ATTR_VALUE_MASK,
  PRIVACY_ATTR_VALUE_MASK_USER_INPUT,
} from '../../../constants'
import type { ElementNode, SerializedNodeWithId, TextNode } from '../../../types'
import { NodeType } from '../../../types'
import type { IsolatedDom } from '../../../../../rum-core/test'
import { createIsolatedDom } from '../../../../../rum-core/test'
import type { ElementsScrollPositions } from '../elementsScrollPositions'
import { createElementsScrollPositions } from '../elementsScrollPositions'
import type { ShadowRootCallBack, ShadowRootsController } from '../shadowRootsController'
import {
  HTML,
  generateLeanSerializedDoc,
  AST_HIDDEN,
  AST_MASK,
  AST_MASK_USER_INPUT,
  AST_ALLOW,
} from './htmlAst.specHelper'
import { serializeDocument } from './serializeDocument'
import type { SerializationContext, SerializeOptions } from './serialization.types'
import { SerializationContextStatus } from './serialization.types'
import { hasSerializedNode } from './serializationUtils'
import { serializeChildNodes, serializeDocumentNode, serializeNodeWithId } from './serializeNode'

const DEFAULT_CONFIGURATION = {} as RumConfiguration

const DEFAULT_SHADOW_ROOT_CONTROLLER: ShadowRootsController = {
  flush: noop,
  stop: noop,
  addShadowRoot: noop,
  removeShadowRoot: noop,
}

const DEFAULT_SERIALIZATION_CONTEXT: SerializationContext = {
  shadowRootsController: DEFAULT_SHADOW_ROOT_CONTROLLER,
  status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT,
  elementsScrollPositions: createElementsScrollPositions(),
}

const DEFAULT_OPTIONS: SerializeOptions = {
  parentNodePrivacyLevel: NodePrivacyLevel.ALLOW,
  serializationContext: DEFAULT_SERIALIZATION_CONTEXT,
  configuration: DEFAULT_CONFIGURATION,
}

describe('serializeNodeWithId', () => {
  let sandbox: HTMLElement
  let addShadowRootSpy: jasmine.Spy<ShadowRootCallBack>

  beforeEach(() => {
    addShadowRootSpy = jasmine.createSpy<ShadowRootCallBack>()
  })

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
      const document = new DOMParser().parseFromString('<!doctype html><html>foo</html>', 'text/html')
      expect(serializeDocument(document, DEFAULT_CONFIGURATION, DEFAULT_SERIALIZATION_CONTEXT)).toEqual({
        type: NodeType.Document,
        childNodes: [
          jasmine.objectContaining({ type: NodeType.DocumentType, name: 'html', publicId: '', systemId: '' }),
          jasmine.objectContaining({ type: NodeType.Element, tagName: 'html' }),
        ],
        adoptedStyleSheets: undefined,
        id: jasmine.any(Number) as unknown as number,
      })
    })
  })

  describe('elements serialization', () => {
    let isolatedDom: IsolatedDom

    beforeEach(() => {
      isolatedDom = createIsolatedDom()
    })

    afterEach(() => {
      isolatedDom.clear()
    })

    function serializeElement(
      node: Element,
      options: SerializeOptions = DEFAULT_OPTIONS
    ): (ElementNode & { id: number }) | null {
      return serializeNodeWithId(node, options) as (ElementNode & { id: number }) | null
    }

    it('serializes a div', () => {
      expect(serializeElement(document.createElement('div'))).toEqual({
        type: NodeType.Element,
        tagName: 'div',
        attributes: {},
        isSVG: undefined,
        childNodes: [],
        id: jasmine.any(Number),
      })
    })

    it('serializes hidden elements', () => {
      const element = document.createElement('div')
      element.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_HIDDEN)

      expect(serializeElement(element)).toEqual({
        type: NodeType.Element,
        tagName: 'div',
        attributes: {
          rr_width: '0px',
          rr_height: '0px',
          [PRIVACY_ATTR_NAME]: PRIVACY_ATTR_VALUE_HIDDEN,
        },
        isSVG: undefined,
        childNodes: [],
        id: jasmine.any(Number),
      })
    })

    it('does not serialize hidden element children', () => {
      const element = document.createElement('div')
      element.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_HIDDEN)
      element.appendChild(document.createElement('hr'))
      expect(serializeElement(element)!.childNodes).toEqual([])
    })

    it('serializes attributes', () => {
      const element = document.createElement('div')
      element.setAttribute('foo', 'bar')
      element.setAttribute('data-foo', 'data-bar')
      element.className = 'zog'
      element.style.width = '10px'

      expect(serializeElement(element)!.attributes).toEqual({
        foo: 'bar',
        'data-foo': 'data-bar',
        class: 'zog',
        style: 'width: 10px;',
      })
    })

    describe('rr scroll attributes', () => {
      let element: HTMLDivElement
      let elementsScrollPositions: ElementsScrollPositions

      beforeEach(() => {
        element = document.createElement('div')
        Object.assign(element.style, { width: '100px', height: '100px', overflow: 'scroll' })
        const inner = document.createElement('div')
        Object.assign(inner.style, { width: '200px', height: '200px' })
        element.appendChild(inner)
        sandbox.appendChild(element)
        element.scrollBy(10, 20)

        elementsScrollPositions = createElementsScrollPositions()
      })

      it('should be retrieved from attributes during initial full snapshot', () => {
        const serializedAttributes = serializeElement(element, {
          ...DEFAULT_OPTIONS,
          serializationContext: {
            shadowRootsController: DEFAULT_SHADOW_ROOT_CONTROLLER,
            status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT,
            elementsScrollPositions,
          },
        })!.attributes

        expect(serializedAttributes).toEqual(
          jasmine.objectContaining({
            rr_scrollLeft: 10,
            rr_scrollTop: 20,
          })
        )
        expect(elementsScrollPositions.get(element)).toEqual({ scrollLeft: 10, scrollTop: 20 })
      })

      it('should not be retrieved from attributes during subsequent full snapshot', () => {
        const serializedAttributes = serializeElement(element, {
          ...DEFAULT_OPTIONS,
          serializationContext: {
            shadowRootsController: DEFAULT_SHADOW_ROOT_CONTROLLER,
            status: SerializationContextStatus.SUBSEQUENT_FULL_SNAPSHOT,
            elementsScrollPositions,
          },
        })!.attributes

        expect(serializedAttributes.rr_scrollLeft).toBeUndefined()
        expect(serializedAttributes.rr_scrollTop).toBeUndefined()
        expect(elementsScrollPositions.get(element)).toBeUndefined()
      })

      it('should be retrieved from elementsScrollPositions during subsequent full snapshot', () => {
        elementsScrollPositions.set(element, { scrollLeft: 10, scrollTop: 20 })

        const serializedAttributes = serializeElement(element, {
          ...DEFAULT_OPTIONS,
          serializationContext: {
            shadowRootsController: DEFAULT_SHADOW_ROOT_CONTROLLER,
            status: SerializationContextStatus.SUBSEQUENT_FULL_SNAPSHOT,
            elementsScrollPositions,
          },
        })!.attributes

        expect(serializedAttributes).toEqual(
          jasmine.objectContaining({
            rr_scrollLeft: 10,
            rr_scrollTop: 20,
          })
        )
      })

      it('should not be retrieved during mutation', () => {
        elementsScrollPositions.set(element, { scrollLeft: 10, scrollTop: 20 })

        const serializedAttributes = serializeElement(element, {
          ...DEFAULT_OPTIONS,
          serializationContext: {
            shadowRootsController: DEFAULT_SHADOW_ROOT_CONTROLLER,
            status: SerializationContextStatus.MUTATION,
          },
        })!.attributes

        expect(serializedAttributes.rr_scrollLeft).toBeUndefined()
        expect(serializedAttributes.rr_scrollTop).toBeUndefined()
      })
    })

    it('ignores white space in <head>', () => {
      const head = document.createElement('head')
      head.innerHTML = '  <title>  foo </title>  '

      expect(serializeElement(head)!.childNodes).toEqual([
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

      expect(serializeElement(input)!).toEqual(
        jasmine.objectContaining({
          attributes: { value: 'toto' },
        })
      )
    })

    it('serializes <textarea> elements value', () => {
      const textarea = document.createElement('textarea')
      textarea.value = 'toto'

      expect(serializeElement(textarea)!).toEqual(
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

      expect(serializeElement(select)!).toEqual(
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

      expect(serializeElement(input)!).toEqual(jasmine.objectContaining({}))
    })

    it('does not serialize <input type="password"> values set via attribute setter', () => {
      const input = document.createElement('input')
      input.type = 'password'
      input.setAttribute('value', 'toto')

      expect(serializeElement(input)!).toEqual(jasmine.objectContaining({}))
    })

    it('serializes <input type="checkbox"> elements checked state', () => {
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      expect(serializeElement(checkbox)!).toEqual(
        jasmine.objectContaining({
          attributes: {
            type: 'checkbox',
            value: 'on',
            checked: false,
          },
        })
      )

      checkbox.checked = true

      expect(serializeElement(checkbox)!).toEqual(
        jasmine.objectContaining({
          attributes: {
            type: 'checkbox',
            value: 'on',
            checked: true,
          },
        })
      )
    })

    it('serializes <input type="radio"> elements checked state', () => {
      const radio = document.createElement('input')
      radio.type = 'radio'
      expect(serializeElement(radio)!.attributes).toEqual({
        type: 'radio',
        value: 'on',
        checked: false,
      })

      radio.checked = true

      expect(serializeElement(radio)!.attributes).toEqual({
        type: 'radio',
        value: 'on',
        checked: true,
      })
    })

    it('serializes <audio> elements paused state', () => {
      const audio = document.createElement('audio')

      expect(serializeElement(audio)!).toEqual(
        jasmine.objectContaining({
          attributes: { rr_mediaState: 'paused' },
        })
      )

      // Emulate a playing audio file
      Object.defineProperty(audio, 'paused', { value: false })

      expect(serializeElement(audio)!).toEqual(
        jasmine.objectContaining({
          attributes: { rr_mediaState: 'played' },
        })
      )
    })

    describe('input privacy mode mask-user-input', () => {
      it('replaces <input> values with asterisks', () => {
        const input = document.createElement('input')
        input.value = 'toto'
        input.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT)

        expect(serializeElement(input)!).toEqual(
          jasmine.objectContaining({
            attributes: {
              [PRIVACY_ATTR_NAME]: PRIVACY_ATTR_VALUE_MASK_USER_INPUT,
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
        parent.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT)

        expect(serializeElement(parent)!.childNodes[0]).toEqual(
          jasmine.objectContaining({
            attributes: { value: '***' },
          })
        )
      })

      it('does not apply mask for <input type="button">', () => {
        const button = document.createElement('input')
        button.type = 'button'
        button.value = 'toto'
        button.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT)

        expect(serializeElement(button)!.attributes.value).toEqual('toto')
      })

      it('does not apply mask for <input type="submit"> contained in a masked ancestor', () => {
        const button = document.createElement('input')
        button.type = 'submit'
        button.value = 'toto'
        button.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT)

        expect(serializeElement(button)!.attributes.value).toEqual('toto')
      })

      it('serializes <input type="radio"> elements without checked property', () => {
        const radio = document.createElement('input')
        radio.type = 'radio'
        radio.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT)

        expect(serializeElement(radio)!.attributes).toEqual({
          type: 'radio',
          value: '***',
          'data-dd-privacy': 'mask-user-input',
        })

        radio.checked = true

        expect(serializeElement(radio)!.attributes).toEqual({
          type: 'radio',
          value: '***',
          'data-dd-privacy': 'mask-user-input',
        })
      })
    })

    describe('input privacy mode mask', () => {
      it('applies mask for <input placeholder="someValue" /> value', () => {
        const input = document.createElement('input')
        input.placeholder = 'someValue'
        input.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK)

        expect(serializeElement(input)!.attributes.placeholder).toEqual('***')
      })
    })

    it('serializes a shadow host', () => {
      const div = document.createElement('div')
      div.attachShadow({ mode: 'open' })
      expect(serializeElement(div, DEFAULT_OPTIONS)).toEqual({
        type: NodeType.Element,
        tagName: 'div',
        attributes: {},
        isSVG: undefined,
        childNodes: [
          {
            type: NodeType.DocumentFragment,
            isShadowRoot: true,
            childNodes: [],
            id: jasmine.any(Number) as unknown as number,
            adoptedStyleSheets: undefined,
          },
        ],
        id: jasmine.any(Number) as unknown as number,
      })
    })

    it('serializes a shadow host with children', () => {
      const div = document.createElement('div')
      div.attachShadow({ mode: 'open' })
      div.shadowRoot!.appendChild(document.createElement('hr'))

      const options: SerializeOptions = {
        ...DEFAULT_OPTIONS,
        serializationContext: {
          ...DEFAULT_SERIALIZATION_CONTEXT,
          shadowRootsController: {
            ...DEFAULT_SHADOW_ROOT_CONTROLLER,
            addShadowRoot: addShadowRootSpy,
          },
        },
      }
      expect(serializeElement(div, options)).toEqual({
        type: NodeType.Element,
        tagName: 'div',
        attributes: {},
        isSVG: undefined,
        childNodes: [
          {
            type: NodeType.DocumentFragment,
            isShadowRoot: true,
            adoptedStyleSheets: undefined,
            childNodes: [
              {
                type: NodeType.Element,
                tagName: 'hr',
                attributes: {},
                isSVG: undefined,
                childNodes: [],
                id: jasmine.any(Number) as unknown as number,
              },
            ],
            id: jasmine.any(Number) as unknown as number,
          },
        ],
        id: jasmine.any(Number) as unknown as number,
      })
      expect(addShadowRootSpy).toHaveBeenCalledWith(div.shadowRoot!)
    })

    it('serializes style node with local CSS', () => {
      const styleNode = document.createElement('style')
      isolatedDom.document.head.appendChild(styleNode)
      const styleSheet = styleNode.sheet
      styleSheet?.insertRule('body { width: 100%; }')
      expect(serializeElement(styleNode)).toEqual({
        type: NodeType.Element,
        tagName: 'style',
        id: jasmine.any(Number) as unknown as number,
        isSVG: undefined,
        attributes: { _cssText: 'body { width: 100%; }' },
        childNodes: [],
      })
    })

    it('serializes style node with dynamic CSS that cannot be fetched', () => {
      const linkNode = document.createElement('link')
      linkNode.setAttribute('rel', 'stylesheet')
      linkNode.setAttribute('href', 'https://datadoghq.com/some/style.css')
      isolatedDom.document.head.appendChild(linkNode)
      expect(serializeNodeWithId(linkNode, DEFAULT_OPTIONS)).toEqual({
        type: NodeType.Element,
        tagName: 'link',
        id: jasmine.any(Number) as unknown as number,
        isSVG: undefined,
        attributes: { rel: 'stylesheet', href: 'https://datadoghq.com/some/style.css' },
        childNodes: [],
      })
    })

    it('serializes style node with dynamic CSS that can be fetched', () => {
      const linkNode = document.createElement('link')
      linkNode.setAttribute('rel', 'stylesheet')
      linkNode.setAttribute('href', 'https://datadoghq.com/some/style.css')
      isolatedDom.document.head.appendChild(linkNode)
      Object.defineProperty(isolatedDom.document, 'styleSheets', {
        value: [
          {
            href: 'https://datadoghq.com/some/style.css',
            cssRules: [{ cssText: 'body { width: 100%; }' }],
          },
        ],
      })

      expect(serializeNodeWithId(linkNode, DEFAULT_OPTIONS)).toEqual({
        type: NodeType.Element,
        tagName: 'link',
        id: jasmine.any(Number) as unknown as number,
        isSVG: undefined,
        attributes: {
          _cssText: 'body { width: 100%; }',
          rel: 'stylesheet',
          href: 'https://datadoghq.com/some/style.css',
        },
        childNodes: [],
      })
    })

    it('does not serialize style node with dynamic CSS that is behind CORS', () => {
      const linkNode = document.createElement('link')
      linkNode.setAttribute('rel', 'stylesheet')
      linkNode.setAttribute('href', 'https://datadoghq.com/some/style.css')
      isolatedDom.document.head.appendChild(linkNode)
      class FakeCSSStyleSheet {
        get cssRules() {
          return []
        }
      }
      const styleSheet = new FakeCSSStyleSheet()
      spyOnProperty(styleSheet, 'cssRules', 'get').and.throwError(new DOMException('cors issue', 'SecurityError'))

      Object.defineProperty(isolatedDom.document, 'styleSheets', {
        value: [styleSheet],
      })

      expect(serializeNodeWithId(linkNode, DEFAULT_OPTIONS)).toEqual({
        type: NodeType.Element,
        tagName: 'link',
        id: jasmine.any(Number) as unknown as number,
        isSVG: undefined,
        attributes: {
          rel: 'stylesheet',
          href: 'https://datadoghq.com/some/style.css',
        },
        childNodes: [],
      })
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
        id: jasmine.any(Number) as unknown as number,
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
        id: jasmine.any(Number) as unknown as number,
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

  describe('handles privacy', () => {
    describe('for privacy tag `hidden`, a DOM tree', () => {
      it('keeps private info private', () => {
        const serializedDoc = generateLeanSerializedDoc(HTML, 'hidden')
        expect(JSON.stringify(serializedDoc)).not.toContain('private')
      })
    })

    describe('for privacy tag `mask`, a DOM tree', () => {
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

    describe('for privacy tag `mask-user-input`, a DOM tree', () => {
      it("doesn't mask text content", () => {
        const serializedDoc = generateLeanSerializedDoc(HTML, 'mask-user-input')
        expect(JSON.stringify(serializedDoc)).not.toContain('᙮᙮')
      })
      it('keeps form fields private', () => {
        const serializedDoc = generateLeanSerializedDoc(HTML, 'mask-user-input')
        expect(JSON.stringify(serializedDoc)).toContain('**')
      })
    })

    describe('for privacy tag `allow`, a DOM tree', () => {
      it("doesn't have innerText alpha numeric", () => {
        const serializedDoc = generateLeanSerializedDoc(HTML, 'allow')
        const innerText = getTextNodesFromSerialized(serializedDoc)
        const privateWordMatchCount = innerText.match(/private/g)?.length
        expect(privateWordMatchCount).toBe(10)
        expect(innerText).toBe(
          '  \n      .example {content: "anything";}\n       private title \n \n     hello private world \n     Loreum ipsum private text \n     hello private world \n     \n      Click https://private.com/path/nested?query=param#hash\n     \n      \n     \n       private option A \n       private option B \n       private option C \n     \n      \n      \n      \n     inputFoo label \n\n      \n\n           Loreum Ipsum private ...\n     \n\n     editable private div \n'
        )
      })

      it('keeps innerText public', () => {
        const serializedDoc = generateLeanSerializedDoc(HTML, 'allow')
        expect(JSON.stringify(serializedDoc)).not.toContain('*')
        expect(JSON.stringify(serializedDoc)).not.toContain('xx')
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
  })
})

describe('serializeDocumentNode handles', function testAllowDomTree() {
  const toJSONObj = (data: any) => JSON.parse(JSON.stringify(data)) as unknown

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
  })

  describe('with dynamic stylesheet', () => {
    let isolatedDom: IsolatedDom

    beforeEach(() => {
      isolatedDom = createIsolatedDom()
    })

    afterEach(() => {
      isolatedDom.clear()
    })

    it('serializes a document with adoptedStyleSheets', () => {
      if (!isAdoptedStyleSheetsSupported()) {
        pending('no adoptedStyleSheets support')
      }
      const styleSheet = new isolatedDom.window.CSSStyleSheet()
      styleSheet.insertRule('div { width: 100%; }')
      isolatedDom.document.adoptedStyleSheets = [styleSheet]
      expect(serializeDocument(isolatedDom.document, DEFAULT_CONFIGURATION, DEFAULT_SERIALIZATION_CONTEXT)).toEqual({
        type: NodeType.Document,
        childNodes: [jasmine.objectContaining({ type: NodeType.Element, tagName: 'html' })],
        adoptedStyleSheets: [
          {
            cssRules: ['div { width: 100%; }'],
            disabled: undefined,
            media: undefined,
          },
        ],
        id: jasmine.any(Number) as unknown as number,
      })
    })
  })

  it('a masked DOM Document itself is still serialized ', () => {
    const serializeOptionsMask: SerializeOptions = {
      ...DEFAULT_OPTIONS,
      parentNodePrivacyLevel: NodePrivacyLevel.MASK,
    }
    expect(serializeDocumentNode(document, serializeOptionsMask)).toEqual({
      type: NodeType.Document,
      childNodes: serializeChildNodes(document, serializeOptionsMask),
      adoptedStyleSheets: undefined,
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
