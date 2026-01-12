import type { BrowserWindow } from '@datadog/browser-rum-core'
import { isAdoptedStyleSheetsSupported, registerCleanupTask } from '@datadog/browser-core/test'
import {
  NodePrivacyLevel,
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_ALLOW,
  PRIVACY_ATTR_VALUE_HIDDEN,
  PRIVACY_ATTR_VALUE_MASK,
  PRIVACY_ATTR_VALUE_MASK_USER_INPUT,
  PRIVACY_ATTR_VALUE_MASK_UNLESS_ALLOWLISTED,
  isAllowlisted,
} from '@datadog/browser-rum-core'
import type { SerializedNodeWithId } from '../../../types'
import { NodeType } from '../../../types'
import { appendElement } from '../../../../../rum-core/test'
import type { AddShadowRootCallBack } from '../shadowRootsController'
import {
  createSerializationTransactionForTesting,
  serializeNodeAndVerifyChangeRecord as serializeNode,
} from '../test/serialization.specHelper'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import type { EmitRecordCallback, EmitStatsCallback } from '../record.types'
import type { RecordingScope } from '../recordingScope'
import {
  HTML,
  generateLeanSerializedDoc,
  AST_HIDDEN,
  AST_MASK,
  AST_MASK_USER_INPUT,
  AST_MASK_UNLESS_ALLOWLISTED,
  AST_ALLOW,
} from './htmlAst.specHelper'
import { serializeChildNodes, serializeDocumentNode } from './serializeNode'
import type { SerializationStats } from './serializationStats'
import { createSerializationStats } from './serializationStats'
import type { SerializationTransaction } from './serializationTransaction'
import { serializeInTransaction, SerializationKind } from './serializationTransaction'

describe('serializeNode', () => {
  let addShadowRootSpy: jasmine.Spy<AddShadowRootCallBack>
  let emitRecordCallback: jasmine.Spy<EmitRecordCallback>
  let emitStatsCallback: jasmine.Spy<EmitStatsCallback>
  let scope: RecordingScope
  let transaction: SerializationTransaction

  beforeEach(() => {
    addShadowRootSpy = jasmine.createSpy()
    emitRecordCallback = jasmine.createSpy()
    emitStatsCallback = jasmine.createSpy()
    scope = createRecordingScopeForTesting({ addShadowRoot: addShadowRootSpy })
    transaction = createSerializationTransactionForTesting({ scope })
  })

  describe('document serialization', () => {
    it('serializes a document', () => {
      const document = new DOMParser().parseFromString('<!doctype html><html>foo</html>', 'text/html')
      expect(serializeNode(document, NodePrivacyLevel.ALLOW, transaction)).toEqual({
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
    it('serializes a div', () => {
      expect(serializeNode(document.createElement('div'), NodePrivacyLevel.ALLOW, transaction)).toEqual({
        type: NodeType.Element,
        tagName: 'div',
        attributes: {},
        isSVG: undefined,
        childNodes: [],
        id: jasmine.any(Number),
      })
    })

    it('serializes SVG elements', () => {
      const svgElement = appendSubtree(
        `
          <svg viewBox="0 0 100 100">
            <clipPath id="myClip">
              <circle cx="40" cy="35" r="35" />
            </clipPath>
            <path
              id="heart"
              d="M10,30 A20,20,0,0,1,50,30 A20,20,0,0,1,90,30 Q90,60,50,90 Q10,60,10,30 Z" />
            <use clip-path="url(#myClip)" href="#heart" fill="red" />
          </svg>
        `
      )
      expect(serializeNode(svgElement, NodePrivacyLevel.ALLOW, transaction)).toEqual({
        type: NodeType.Element,
        id: 0,
        tagName: 'svg',
        attributes: { viewBox: '0 0 100 100' },
        isSVG: true,
        childNodes: [
          {
            type: NodeType.Element,
            id: 1,
            tagName: 'clippath',
            attributes: { id: 'myClip' },
            isSVG: true,
            childNodes: [
              {
                type: NodeType.Element,
                id: 2,
                tagName: 'circle',
                attributes: { cx: '40', cy: '35', r: '35' },
                isSVG: true,
                childNodes: [],
              },
            ],
          },
          {
            type: NodeType.Element,
            id: 3,
            tagName: 'path',
            attributes: {
              id: 'heart',
              d: 'M10,30 A20,20,0,0,1,50,30 A20,20,0,0,1,90,30 Q90,60,50,90 Q10,60,10,30 Z',
            },
            isSVG: true,
            childNodes: [],
          },
          {
            type: NodeType.Element,
            id: 4,
            tagName: 'use',
            attributes: {
              'clip-path': 'url(#myClip)',
              href: '#heart',
              fill: 'red',
            },
            isSVG: true,
            childNodes: [],
          },
        ],
      })
    })

    it('serializes hidden elements', () => {
      const element = document.createElement('div')
      element.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_HIDDEN)

      expect(serializeNode(element, NodePrivacyLevel.ALLOW, transaction)).toEqual({
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
      expect(serializeNode(element, NodePrivacyLevel.ALLOW, transaction)?.childNodes).toEqual([])
    })

    it('serializes attributes', () => {
      const element = appendElement('<div foo="bar" data-foo="data-bar"></div>')
      element.className = 'zog'
      element.style.width = '10px'

      expect(serializeNode(element, NodePrivacyLevel.ALLOW, transaction)?.attributes).toEqual({
        foo: 'bar',
        'data-foo': 'data-bar',
        class: 'zog',
        style: 'width: 10px;',
      })
    })

    describe('rr scroll attributes', () => {
      const elementStyle = 'width: 100px; height: 100px; overflow: scroll'
      const createScrolledElement = (x: number, y: number): Element => {
        const element = appendElement(
          `<div style="${elementStyle}"><div style="width: 200px; height: 200px"></div></div>`
        )
        element.scrollBy(x, y)
        return element
      }

      it('should be retrieved from attributes during initial full snapshot', () => {
        const transaction = createSerializationTransactionForTesting({
          kind: SerializationKind.INITIAL_FULL_SNAPSHOT,
          scope,
        })
        const element = createScrolledElement(10, 20)
        const serializedNode = serializeNode(element, NodePrivacyLevel.ALLOW, transaction)

        expect(serializedNode?.attributes).toEqual(
          jasmine.objectContaining({
            rr_scrollLeft: 10,
            rr_scrollTop: 20,
          })
        )
        expect(scope.elementsScrollPositions.get(element)).toEqual({ scrollLeft: 10, scrollTop: 20 })
      })

      it('does not serialize rr_scrollLeft if it would be zero', () => {
        const transaction = createSerializationTransactionForTesting({
          kind: SerializationKind.INITIAL_FULL_SNAPSHOT,
          scope,
        })
        const element = createScrolledElement(0, 20)
        const serializedNode = serializeNode(element, NodePrivacyLevel.ALLOW, transaction)

        expect(serializedNode?.attributes).toEqual({
          rr_scrollTop: 20,
          style: elementStyle,
        })
        expect(scope.elementsScrollPositions.get(element)).toEqual({ scrollLeft: 0, scrollTop: 20 })
      })

      it('does not serialize rr_scrollTop if it would be zero', () => {
        const transaction = createSerializationTransactionForTesting({
          kind: SerializationKind.INITIAL_FULL_SNAPSHOT,
          scope,
        })
        const element = createScrolledElement(10, 0)
        const serializedNode = serializeNode(element, NodePrivacyLevel.ALLOW, transaction)

        expect(serializedNode?.attributes).toEqual({
          rr_scrollLeft: 10,
          style: elementStyle,
        })
        expect(scope.elementsScrollPositions.get(element)).toEqual({ scrollLeft: 10, scrollTop: 0 })
      })

      it('does not serialize any rr_scroll attributes if the element is not scrolled', () => {
        const transaction = createSerializationTransactionForTesting({
          kind: SerializationKind.INITIAL_FULL_SNAPSHOT,
          scope,
        })
        const element = createScrolledElement(0, 0)
        const serializedNode = serializeNode(element, NodePrivacyLevel.ALLOW, transaction)

        expect(serializedNode?.attributes).toEqual({
          style: elementStyle,
        })
        expect(scope.elementsScrollPositions.get(element)).toEqual(undefined)
      })

      it('should not be retrieved from attributes during subsequent full snapshot', () => {
        const transaction = createSerializationTransactionForTesting({
          kind: SerializationKind.SUBSEQUENT_FULL_SNAPSHOT,
          scope,
        })
        const element = createScrolledElement(10, 20)
        const serializedNode = serializeNode(element, NodePrivacyLevel.ALLOW, transaction)

        expect(serializedNode?.attributes.rr_scrollLeft).toBeUndefined()
        expect(serializedNode?.attributes.rr_scrollTop).toBeUndefined()
        expect(scope.elementsScrollPositions.get(element)).toBeUndefined()
      })

      it('should be retrieved from elementsScrollPositions during subsequent full snapshot', () => {
        const element = createScrolledElement(10, 20)
        scope.elementsScrollPositions.set(element, { scrollLeft: 10, scrollTop: 20 })

        const transaction = createSerializationTransactionForTesting({
          kind: SerializationKind.SUBSEQUENT_FULL_SNAPSHOT,
          scope,
        })
        const serializedNode = serializeNode(element, NodePrivacyLevel.ALLOW, transaction)

        expect(serializedNode?.attributes).toEqual(
          jasmine.objectContaining({
            rr_scrollLeft: 10,
            rr_scrollTop: 20,
          })
        )
      })

      it('should not be retrieved during mutation', () => {
        const element = createScrolledElement(10, 20)
        scope.elementsScrollPositions.set(element, { scrollLeft: 10, scrollTop: 20 })

        const transaction = createSerializationTransactionForTesting({
          kind: SerializationKind.INCREMENTAL_SNAPSHOT,
          scope,
        })
        const serializedNode = serializeNode(element, NodePrivacyLevel.ALLOW, transaction)

        expect(serializedNode?.attributes.rr_scrollLeft).toBeUndefined()
        expect(serializedNode?.attributes.rr_scrollTop).toBeUndefined()
      })
    })

    it('ignores white space in <head>', () => {
      const head = document.createElement('head')
      head.innerHTML = '  <title>  foo </title>  '

      expect(serializeNode(head, NodePrivacyLevel.ALLOW, transaction)?.childNodes).toEqual([
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

      expect(serializeNode(input, NodePrivacyLevel.ALLOW, transaction)).toEqual(
        jasmine.objectContaining({
          attributes: { value: 'toto' },
        })
      )
    })

    it('serializes <textarea> elements value', () => {
      const textarea = document.createElement('textarea')
      textarea.value = 'toto'

      expect(serializeNode(textarea, NodePrivacyLevel.ALLOW, transaction)).toEqual(
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

      expect(serializeNode(select, NodePrivacyLevel.ALLOW, transaction)).toEqual(
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
                selected: '',
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

      expect(serializeNode(input, NodePrivacyLevel.ALLOW, transaction)).toEqual(jasmine.objectContaining({}))
    })

    it('does not serialize <input type="password"> values set via attribute setter', () => {
      const input = document.createElement('input')
      input.type = 'password'
      input.setAttribute('value', 'toto')

      expect(serializeNode(input, NodePrivacyLevel.ALLOW, transaction)).toEqual(jasmine.objectContaining({}))
    })

    it('serializes <input type="checkbox"> elements checked state', () => {
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      expect(serializeNode(checkbox, NodePrivacyLevel.ALLOW, transaction)).toEqual(
        jasmine.objectContaining({
          attributes: {
            type: 'checkbox',
            value: 'on',
          },
        })
      )

      checkbox.checked = true

      expect(serializeNode(checkbox, NodePrivacyLevel.ALLOW, transaction)).toEqual(
        jasmine.objectContaining({
          attributes: {
            type: 'checkbox',
            value: 'on',
            checked: '',
          },
        })
      )
    })

    it('serializes <input type="radio"> elements checked state', () => {
      const radio = document.createElement('input')
      radio.type = 'radio'
      expect(serializeNode(radio, NodePrivacyLevel.ALLOW, transaction)?.attributes).toEqual({
        type: 'radio',
        value: 'on',
      })

      radio.checked = true

      expect(serializeNode(radio, NodePrivacyLevel.ALLOW, transaction)?.attributes).toEqual({
        type: 'radio',
        value: 'on',
        checked: '',
      })
    })

    it('serializes <audio> elements paused state', () => {
      const audio = document.createElement('audio')

      expect(serializeNode(audio, NodePrivacyLevel.ALLOW, transaction)).toEqual(
        jasmine.objectContaining({
          attributes: { rr_mediaState: 'paused' },
        })
      )

      // Emulate a playing audio file
      Object.defineProperty(audio, 'paused', { value: false })

      expect(serializeNode(audio, NodePrivacyLevel.ALLOW, transaction)).toEqual(
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

        expect(serializeNode(input, NodePrivacyLevel.ALLOW, transaction)).toEqual(
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

        expect(serializeNode(parent, NodePrivacyLevel.ALLOW, transaction)?.childNodes[0]).toEqual(
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

        expect(serializeNode(button, NodePrivacyLevel.ALLOW, transaction)?.attributes.value).toEqual('toto')
      })

      it('does not apply mask for <input type="submit"> contained in a masked ancestor', () => {
        const button = document.createElement('input')
        button.type = 'submit'
        button.value = 'toto'
        button.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT)

        expect(serializeNode(button, NodePrivacyLevel.ALLOW, transaction)?.attributes.value).toEqual('toto')
      })

      it('serializes <input type="radio"> elements without checked property', () => {
        const radio = document.createElement('input')
        radio.type = 'radio'
        radio.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT)

        expect(serializeNode(radio, NodePrivacyLevel.ALLOW, transaction)?.attributes).toEqual({
          type: 'radio',
          value: '***',
          'data-dd-privacy': 'mask-user-input',
        })

        radio.checked = true

        expect(serializeNode(radio, NodePrivacyLevel.ALLOW, transaction)?.attributes).toEqual({
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

        expect(serializeNode(input, NodePrivacyLevel.ALLOW, transaction)?.attributes.placeholder).toEqual('***')
      })
    })

    describe('input privacy mode mask-unless-allowlisted', () => {
      beforeEach(() => {
        ;(window as BrowserWindow).$DD_ALLOW = new Set(['allowlisted value', 'hello'])
      })

      afterEach(() => {
        ;(window as BrowserWindow).$DD_ALLOW = undefined
      })

      it('should behave like mask-user-input', () => {
        const input = document.createElement('input')
        input.value = 'toto'
        input.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_UNLESS_ALLOWLISTED)

        expect(serializeNode(input, NodePrivacyLevel.ALLOW, transaction)).toEqual(jasmine.objectContaining({}))
      })
    })

    describe('shadow dom', () => {
      it('serializes a shadow host', () => {
        const div = document.createElement('div')
        div.attachShadow({ mode: 'open' })
        expect(serializeNode(div, NodePrivacyLevel.ALLOW, transaction)).toEqual({
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
        const shadowRoot = div.attachShadow({ mode: 'open' })
        shadowRoot.appendChild(document.createElement('hr'))

        expect(serializeNode(div, NodePrivacyLevel.ALLOW, transaction)).toEqual({
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
        expect(addShadowRootSpy).toHaveBeenCalledWith(shadowRoot, jasmine.anything())
      })

      it('propagates the privacy mode to the shadow root children', () => {
        const div = document.createElement('div')
        div.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK)
        const shadowRoot = div.attachShadow({ mode: 'open' })
        shadowRoot.appendChild(document.createTextNode('foo'))

        expect(serializeNode(div, NodePrivacyLevel.ALLOW, transaction)).toEqual(
          jasmine.objectContaining({
            attributes: {
              [PRIVACY_ATTR_NAME]: PRIVACY_ATTR_VALUE_MASK,
            },
            childNodes: [
              jasmine.objectContaining({
                childNodes: [
                  jasmine.objectContaining({
                    textContent: 'xxx',
                  }),
                ],
              }),
            ],
          })
        )
      })
    })

    describe('<style> elements', () => {
      let stats: SerializationStats
      let transaction: SerializationTransaction

      beforeEach(() => {
        stats = createSerializationStats()
        transaction = createSerializationTransactionForTesting({ stats, scope })
      })

      it('serializes a node with dynamically edited CSS rules', () => {
        const styleNode = appendElement('<style></style>', document.head) as HTMLStyleElement
        styleNode.sheet!.insertRule('body { width: 100%; }')

        expect(serializeNode(styleNode, NodePrivacyLevel.ALLOW, transaction)).toEqual({
          type: NodeType.Element,
          tagName: 'style',
          id: jasmine.any(Number) as unknown as number,
          isSVG: undefined,
          attributes: { _cssText: 'body { width: 100%; }' },
          childNodes: [],
        })
        expect(stats).toEqual({
          cssText: { count: 1, max: 21, sum: 21 },
          serializationDuration: jasmine.anything(),
        })
      })

      it('serializes a node with CSS rules specified as inner text', () => {
        const styleNode = appendElement('<style>body { width: 100%; }</style>', document.head) as HTMLStyleElement

        expect(serializeNode(styleNode, NodePrivacyLevel.ALLOW, transaction)).toEqual({
          type: NodeType.Element,
          tagName: 'style',
          id: jasmine.any(Number) as unknown as number,
          isSVG: undefined,
          attributes: { _cssText: 'body { width: 100%; }' },
          childNodes: [],
        })
        expect(stats).toEqual({
          cssText: { count: 1, max: 21, sum: 21 },
          serializationDuration: jasmine.anything(),
        })
      })

      it('serializes a node with CSS rules specified as inner text then dynamically edited', () => {
        const styleNode = appendElement('<style>body { width: 100%; }</style>', document.head) as HTMLStyleElement
        styleNode.sheet!.insertRule('body { color: red; }')

        expect(serializeNode(styleNode, NodePrivacyLevel.ALLOW, transaction)).toEqual({
          type: NodeType.Element,
          tagName: 'style',
          id: jasmine.any(Number) as unknown as number,
          isSVG: undefined,
          attributes: { _cssText: 'body { color: red; }body { width: 100%; }' },
          childNodes: [],
        })
        expect(stats).toEqual({
          cssText: { count: 1, max: 41, sum: 41 },
          serializationDuration: jasmine.anything(),
        })
      })

      it('serializes a subtree with multiple nodes', () => {
        const containerNode = appendElement('<div></div>', document.body) as HTMLDivElement

        const cssText1 = 'body { width: 100%; }'
        appendElement(`<style>${cssText1}</style>`, containerNode) as HTMLStyleElement

        const cssText2 = 'body { background-color: green; }'
        appendElement(`<style>${cssText2}</style>`, containerNode) as HTMLStyleElement

        expect(serializeNode(containerNode, NodePrivacyLevel.ALLOW, transaction)).toEqual({
          type: NodeType.Element,
          tagName: 'div',
          id: jasmine.any(Number) as unknown as number,
          isSVG: undefined,
          attributes: {},
          childNodes: [
            {
              type: NodeType.Element,
              tagName: 'style',
              id: jasmine.any(Number) as unknown as number,
              isSVG: undefined,
              attributes: { _cssText: cssText1 },
              childNodes: [],
            },
            {
              type: NodeType.Element,
              tagName: 'style',
              id: jasmine.any(Number) as unknown as number,
              isSVG: undefined,
              attributes: { _cssText: cssText2 },
              childNodes: [],
            },
          ],
        })
        expect(stats).toEqual({
          cssText: { count: 2, max: 33, sum: 54 },
          serializationDuration: jasmine.anything(),
        })
      })
    })

    describe('<link rel="stylesheet"> elements', () => {
      let stats: SerializationStats
      let transaction: SerializationTransaction

      beforeEach(() => {
        stats = createSerializationStats()
        transaction = createSerializationTransactionForTesting({ stats, scope })
      })

      afterEach(() => {
        // styleSheets is part of the document prototype so we can safely delete it
        delete (document as { styleSheets?: StyleSheetList }).styleSheets
      })

      it('does not inline external CSS if it cannot be fetched', () => {
        const linkNode = appendElement(
          "<link rel='stylesheet' href='https://datadoghq.com/some/style.css' />",
          document.head
        )

        expect(serializeNode(linkNode, NodePrivacyLevel.ALLOW, transaction)).toEqual({
          type: NodeType.Element,
          tagName: 'link',
          id: jasmine.any(Number) as unknown as number,
          isSVG: undefined,
          attributes: { rel: 'stylesheet', href: 'https://datadoghq.com/some/style.css' },
          childNodes: [],
        })
        expect(stats).toEqual({
          cssText: { count: 0, max: 0, sum: 0 },
          serializationDuration: jasmine.anything(),
        })
      })

      it('inlines external CSS it can be fetched', () => {
        const linkNode = appendElement(
          "<link rel='stylesheet' href='https://datadoghq.com/some/style.css' />",
          document.head
        )

        const styleSheet = {
          href: 'https://datadoghq.com/some/style.css',
          cssRules: [{ cssText: 'body { width: 100%; }' }],
        }
        Object.defineProperty(document, 'styleSheets', {
          value: [styleSheet],
          configurable: true,
        })
        Object.defineProperty(linkNode, 'sheet', {
          value: styleSheet,
          configurable: true,
        })

        expect(serializeNode(linkNode, NodePrivacyLevel.ALLOW, transaction)).toEqual({
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
        expect(stats).toEqual({
          cssText: { count: 1, max: 21, sum: 21 },
          serializationDuration: jasmine.anything(),
        })
      })

      it('does not inline external CSS if the style sheet is behind CORS', () => {
        const linkNode = appendElement(
          "<link rel='stylesheet' href='https://datadoghq.com/some/style.css' />",
          document.head
        )
        class FakeCSSStyleSheet {
          get cssRules() {
            return []
          }
        }
        const styleSheet = new FakeCSSStyleSheet()
        spyOnProperty(styleSheet, 'cssRules', 'get').and.throwError(new DOMException('cors issue', 'SecurityError'))

        Object.defineProperty(document, 'styleSheets', {
          value: [styleSheet],
          configurable: true,
        })

        expect(serializeNode(linkNode, NodePrivacyLevel.ALLOW, transaction)).toEqual({
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
        expect(stats).toEqual({
          cssText: { count: 0, max: 0, sum: 0 },
          serializationDuration: jasmine.anything(),
        })
      })
    })
  })

  describe('text nodes serialization', () => {
    it('serializes a text node', () => {
      const parentEl = document.createElement('bar')
      parentEl.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_ALLOW)
      const textNode = document.createTextNode('foo')
      parentEl.appendChild(textNode)
      expect(serializeNode(textNode, NodePrivacyLevel.ALLOW, transaction)).toEqual({
        type: NodeType.Text,
        id: jasmine.any(Number) as unknown as number,
        textContent: 'foo',
      })
    })

    it('serializes an empty text node', () => {
      const parentEl = document.createElement('bar')
      const textNode = document.createTextNode('')
      parentEl.appendChild(textNode)
      expect(serializeNode(textNode, NodePrivacyLevel.ALLOW, transaction)).toEqual({
        type: NodeType.Text,
        id: jasmine.any(Number) as unknown as number,
        textContent: '',
      })
    })

    it('does not serialize text nodes with only white space if the parent is a HEAD element', () => {
      const head = document.getElementsByTagName('head')[0]
      const textNode = document.createTextNode('   ')
      head.appendChild(textNode)
      expect(serializeNode(textNode, NodePrivacyLevel.ALLOW, transaction)).toBeNull()
      head.removeChild(textNode)
    })
  })

  describe('CDATA nodes serialization', () => {
    it('serializes a CDATA node', () => {
      const xmlDocument = new DOMParser().parseFromString('<root></root>', 'text/xml')
      const cdataNode = xmlDocument.createCDATASection('foo')
      expect(serializeNode(cdataNode, NodePrivacyLevel.ALLOW, transaction)).toEqual({
        type: NodeType.CDATA,
        id: jasmine.any(Number) as unknown as number,
        textContent: '',
      })
    })
  })

  it('adds serialized node ids to the provided Set', () => {
    serializeInTransaction(
      SerializationKind.INITIAL_FULL_SNAPSHOT,
      emitRecordCallback,
      emitStatsCallback,
      scope,
      (transaction) => {
        transaction.serializedNodeIds = new Set()
        const node = serializeNode(document.createElement('div'), NodePrivacyLevel.ALLOW, transaction)!
        expect(transaction.serializedNodeIds).toEqual(new Set([node.id]))
        return []
      }
    )
  })

  describe('ignores some nodes', () => {
    it('does not save ignored nodes in the serializedNodeIds set', () => {
      serializeInTransaction(
        SerializationKind.INITIAL_FULL_SNAPSHOT,
        emitRecordCallback,
        emitStatsCallback,
        scope,
        (transaction) => {
          transaction.serializedNodeIds = new Set()
          serializeNode(document.createElement('script'), NodePrivacyLevel.ALLOW, transaction)
          expect(transaction.serializedNodeIds.size).toBe(0)
          return []
        }
      )
    })

    it('does not serialize ignored nodes', () => {
      const scriptElement = document.createElement('script')
      expect(serializeNode(scriptElement, NodePrivacyLevel.ALLOW, transaction)).toBeNull()
      expect(scope.nodeIds.get(scriptElement)).toBe(undefined)
    })

    it('ignores script tags', () => {
      const scriptElement = document.createElement('script')
      expect(serializeNode(scriptElement, NodePrivacyLevel.ALLOW, transaction)).toBeNull()
    })

    it('ignores comments', () => {
      const commentNode = document.createComment('foo')
      expect(serializeNode(commentNode, NodePrivacyLevel.ALLOW, transaction)).toBeNull()
    })

    it('ignores link favicons', () => {
      const linkElement = document.createElement('link')
      linkElement.setAttribute('rel', 'shortcut icon')
      expect(serializeNode(linkElement, NodePrivacyLevel.ALLOW, transaction)).toBeNull()
    })

    it('ignores meta keywords', () => {
      const metaElement = document.createElement('meta')
      metaElement.setAttribute('name', 'keywords')
      expect(serializeNode(metaElement, NodePrivacyLevel.ALLOW, transaction)).toBeNull()
    })

    it('ignores meta name attribute casing', () => {
      const metaElement = document.createElement('meta')
      metaElement.setAttribute('name', 'KeYwOrDs')
      expect(serializeNode(metaElement, NodePrivacyLevel.ALLOW, transaction)).toBeNull()
    })
  })

  describe('handles privacy', () => {
    describe('for privacy tag `hidden`, a DOM tree', () => {
      it('does not include any private info', () => {
        const serializedDoc = generateLeanSerializedDoc(HTML, 'hidden')
        expect(JSON.stringify(serializedDoc)).not.toContain('private')
      })
    })

    describe('for privacy tag `mask`, a DOM tree', () => {
      it('obfuscates all text content', () => {
        const serializedDoc = generateLeanSerializedDoc(HTML, 'mask')
        for (const textContents of getAllTextContents(serializedDoc)) {
          expect(textContents).toEqual(jasmine.stringMatching(/^[*x\s]*$/))
        }
      })

      it('obfuscates attributes and text content', () => {
        const serializedDoc = generateLeanSerializedDoc(HTML, 'mask')
        expect(JSON.stringify(serializedDoc)).not.toContain('private')
      })
    })

    describe('for privacy tag `mask-user-input`, a DOM tree', () => {
      it('does not obfuscate text content', () => {
        const serializedDoc = generateLeanSerializedDoc(HTML, 'mask-user-input')
        expect(JSON.stringify(serializedDoc)).not.toContain('᙮᙮')
      })

      it('obfuscates input fields', () => {
        const serializedDoc = generateLeanSerializedDoc(HTML, 'mask-user-input')
        expect(JSON.stringify(serializedDoc)).toContain('**')
      })
    })

    describe('for privacy tag `mask-unless-allowlisted`, a DOM tree', () => {
      beforeEach(() => {
        ;(window as BrowserWindow).$DD_ALLOW = new Set(['private title', 'hello private world'])
      })

      afterEach(() => {
        ;(window as BrowserWindow).$DD_ALLOW = undefined
      })

      it('obfuscates text content not in allowlist', () => {
        const serializedDoc = generateLeanSerializedDoc(HTML, 'mask-unless-allowlisted')
        const textContents = getAllTextContents(serializedDoc)
        for (const textContent of textContents) {
          if (isAllowlisted(textContent)) {
            expect(textContent).not.toEqual(jasmine.stringMatching(/^[x*]+$/))
          } else {
            expect(textContent).toEqual(jasmine.stringMatching(/^[x\s*]*$/))
          }
        }
      })

      it('preserves text content in allowlist', () => {
        const serializedDoc = generateLeanSerializedDoc(HTML, 'mask-unless-allowlisted')
        // Allowlisted content should be preserved
        expect(JSON.stringify(serializedDoc)).toContain('private title')
        expect(JSON.stringify(serializedDoc)).toContain('hello private world')
      })

      it('obfuscates input fields not in allowlist', () => {
        const serializedDoc = generateLeanSerializedDoc(HTML, 'mask-unless-allowlisted')
        expect(JSON.stringify(serializedDoc)).toContain('***')
      })

      it('obfuscates attributes and non-allowlisted text content', () => {
        const serializedDoc = generateLeanSerializedDoc(HTML, 'mask-unless-allowlisted')
        const attributeValues = getAllAttributeValues(serializedDoc)
        for (const attributeValue of attributeValues) {
          if (isAllowlisted(attributeValue)) {
            expect(attributeValue).not.toEqual(jasmine.stringMatching(/^[x\s*]*$/))
          } else {
            expect(attributeValue).toEqual(jasmine.stringMatching(/^[x\s*]*$/))
          }
        }
      })

      it('fails closed when allowlist is empty', () => {
        ;(window as BrowserWindow).$DD_ALLOW = new Set()
        const serializedDoc = generateLeanSerializedDoc(HTML, 'mask-unless-allowlisted')

        // All text content should be masked
        const textContents = getAllTextContents(serializedDoc)
        for (const textContent of textContents) {
          if (textContent.trim()) {
            expect(textContent).toEqual(jasmine.stringMatching(/^[x\s*]*$/))
          }
        }
      })

      it('fails closed when allowlist is undefined', () => {
        ;(window as BrowserWindow).$DD_ALLOW = undefined
        const serializedDoc = generateLeanSerializedDoc(HTML, 'mask-unless-allowlisted')

        // All text content should be masked
        const textContents = getAllTextContents(serializedDoc)
        for (const textContent of textContents) {
          expect(textContent).toEqual(jasmine.stringMatching(/^[x\s*]*$/))
        }
      })
    })

    describe('for privacy tag `allow`, a DOM tree', () => {
      it('does not obfuscate anything', () => {
        const serializedDoc = generateLeanSerializedDoc(HTML, 'allow')
        expect(JSON.stringify(serializedDoc)).not.toContain('*')
        expect(JSON.stringify(serializedDoc)).not.toContain('xx')
      })
    })

    function getAllTextContents(serializedNode: SerializedNodeWithId): string[] {
      if (serializedNode.type === NodeType.Text) {
        return [serializedNode.textContent.trim()]
      }
      if ('childNodes' in serializedNode) {
        return serializedNode.childNodes.reduce<string[]>(
          (result, child) => result.concat(getAllTextContents(child)),
          []
        )
      }
      return []
    }

    function getAllAttributeValues(serializedNode: SerializedNodeWithId): string[] {
      if (serializedNode.type === NodeType.Element) {
        // Exclude attributes that are privacy tags
        return Object.entries(serializedNode.attributes)
          .filter(([key]) => !key.startsWith(PRIVACY_ATTR_NAME))
          .map(([, value]) => String(value))
      }
      if ('childNodes' in serializedNode) {
        return serializedNode.childNodes.reduce<string[]>(
          (result, child) => result.concat(getAllAttributeValues(child)),
          []
        )
      }
      return []
    }
  })
})

describe('serializeDocumentNode handles', function testAllowDomTree() {
  const toJSONObj = (data: any) => JSON.parse(JSON.stringify(data)) as unknown
  let stats: SerializationStats
  let transaction: SerializationTransaction

  beforeEach(() => {
    stats = createSerializationStats()
    transaction = createSerializationTransactionForTesting({ stats })
    registerCleanupTask(() => {
      if (isAdoptedStyleSheetsSupported()) {
        document.adoptedStyleSheets = []
      }
    })
  })

  describe('with dynamic stylesheet', () => {
    it('serializes a document with adoptedStyleSheets', () => {
      if (!isAdoptedStyleSheetsSupported()) {
        pending('no adoptedStyleSheets support')
      }

      const styleSheet = new window.CSSStyleSheet()
      styleSheet.insertRule('div { width: 100%; }')
      document.adoptedStyleSheets = [styleSheet]

      expect(serializeDocumentNode(document, NodePrivacyLevel.ALLOW, transaction)).toEqual({
        type: NodeType.Document,
        id: 0,
        childNodes: [
          jasmine.objectContaining({ type: NodeType.DocumentType }),
          jasmine.objectContaining({ type: NodeType.Element, tagName: 'html' }),
        ],
        adoptedStyleSheets: [
          {
            cssRules: ['div { width: 100%; }'],
            disabled: undefined,
            media: undefined,
          },
        ],
      })
      expect(stats.cssText).toEqual({ count: 1, max: 20, sum: 20 })
    })
  })

  it('a masked DOM Document itself is still serialized ', () => {
    expect(serializeDocumentNode(document, NodePrivacyLevel.MASK, transaction)).toEqual({
      type: NodeType.Document,
      id: 0,
      childNodes: serializeChildNodes(document, NodePrivacyLevel.MASK, transaction),
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

  describe('for privacy tag `mask-unless-allowlisted`, a DOM tree', function testMaskUnlessAllowlistedDomTree() {
    it('is serialized correctly when no allowlist is provided', () => {
      const serializedDoc = generateLeanSerializedDoc(HTML, 'mask-unless-allowlisted')
      expect(toJSONObj(serializedDoc)).toEqual(AST_MASK_UNLESS_ALLOWLISTED)
    })
  })

  describe('for privacy tag `allow`, a DOM tree', function testAllowDomTree() {
    it('is serialized correctly', () => {
      const serializedDoc = generateLeanSerializedDoc(HTML, 'allow')
      expect(toJSONObj(serializedDoc)).toEqual(AST_ALLOW)
    })
  })
})

function appendSubtree(html: string): Element {
  return appendElement(html.replace(/(^|\n)\s+/g, ' ').replace(/> </g, '><'))
}
