import {
  reducePrivacyLevel,
  getNodeSelfPrivacyLevel,
  getTextContent,
  isNodeShadowRoot,
  hasChildNodes,
  forEachChildNodes,
  NodePrivacyLevel,
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_HIDDEN,
} from '@datadog/browser-rum-core'
import { assign } from '@datadog/browser-core'
import type {
  DocumentFragmentNode,
  DocumentNode,
  SerializedNode,
  SerializedNodeWithId,
  CDataNode,
  DocumentTypeNode,
  ElementNode,
  TextNode,
} from '../../../types'
import { NodeType } from '../../../types'
import { getSerializedNodeId, getValidTagName, setSerializedNodeId } from './serializationUtils'
import type { SerializeOptions } from './serialization.types'
import { serializeStyleSheets } from './serializeStyleSheets'
import { serializeAttributes } from './serializeAttributes'

export function serializeNodeWithId(node: Node, options: SerializeOptions): SerializedNodeWithId | null {
  const serializedNode = serializeNode(node, options)
  if (!serializedNode) {
    return null
  }

  // Try to reuse the previous id
  const id = getSerializedNodeId(node) || generateNextId()
  const serializedNodeWithId = serializedNode as SerializedNodeWithId
  serializedNodeWithId.id = id
  setSerializedNodeId(node, id)
  if (options.serializedNodeIds) {
    options.serializedNodeIds.add(id)
  }
  return serializedNodeWithId
}

let _nextId = 1
export function generateNextId(): number {
  return _nextId++
}

export function serializeChildNodes(node: Node, options: SerializeOptions): SerializedNodeWithId[] {
  const result: SerializedNodeWithId[] = []
  forEachChildNodes(node, (childNode) => {
    const serializedChildNode = serializeNodeWithId(childNode, options)
    if (serializedChildNode) {
      result.push(serializedChildNode)
    }
  })
  return result
}

function serializeNode(node: Node, options: SerializeOptions): SerializedNode | undefined {
  switch (node.nodeType) {
    case node.DOCUMENT_NODE:
      return serializeDocumentNode(node as Document, options)
    case node.DOCUMENT_FRAGMENT_NODE:
      return serializeDocumentFragmentNode(node as DocumentFragment, options)
    case node.DOCUMENT_TYPE_NODE:
      return serializeDocumentTypeNode(node as DocumentType)
    case node.ELEMENT_NODE:
      return serializeElementNode(node as Element, options)
    case node.TEXT_NODE:
      return serializeTextNode(node as Text, options)
    case node.CDATA_SECTION_NODE:
      return serializeCDataNode()
  }
}

export function serializeDocumentNode(document: Document, options: SerializeOptions): DocumentNode {
  return {
    type: NodeType.Document,
    childNodes: serializeChildNodes(document, options),
    adoptedStyleSheets: serializeStyleSheets(document.adoptedStyleSheets),
  }
}

function serializeDocumentFragmentNode(
  element: DocumentFragment,
  options: SerializeOptions
): DocumentFragmentNode | undefined {
  const isShadowRoot = isNodeShadowRoot(element)
  if (isShadowRoot) {
    options.serializationContext.shadowRootsController.addShadowRoot(element)
  }

  return {
    type: NodeType.DocumentFragment,
    childNodes: serializeChildNodes(element, options),
    isShadowRoot,
    adoptedStyleSheets: isShadowRoot ? serializeStyleSheets(element.adoptedStyleSheets) : undefined,
  }
}

function serializeDocumentTypeNode(documentType: DocumentType): DocumentTypeNode {
  return {
    type: NodeType.DocumentType,
    name: documentType.name,
    publicId: documentType.publicId,
    systemId: documentType.systemId,
  }
}

/**
 * Serializing Element nodes involves capturing:
 * 1. HTML ATTRIBUTES:
 * 2. JS STATE:
 * - scroll offsets
 * - Form fields (input value, checkbox checked, option selection, range)
 * - Canvas state,
 * - Media (video/audio) play mode + currentTime
 * - iframe contents
 * - webcomponents
 * 3. CUSTOM PROPERTIES:
 * - height+width for when `hidden` to cover the element
 * 4. EXCLUDED INTERACTION STATE:
 * - focus (possible, but not worth perf impact)
 * - hover (tracked only via mouse activity)
 * - fullscreen mode
 */

function serializeElementNode(element: Element, options: SerializeOptions): ElementNode | undefined {
  const tagName = getValidTagName(element.tagName)
  const isSVG = isSVGElement(element) || undefined

  // For performance reason, we don't use getNodePrivacyLevel directly: we leverage the
  // parentNodePrivacyLevel option to avoid iterating over all parents
  const nodePrivacyLevel = reducePrivacyLevel(getNodeSelfPrivacyLevel(element), options.parentNodePrivacyLevel)

  if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
    const { width, height } = element.getBoundingClientRect()
    return {
      type: NodeType.Element,
      tagName,
      attributes: {
        rr_width: `${width}px`,
        rr_height: `${height}px`,
        [PRIVACY_ATTR_NAME]: PRIVACY_ATTR_VALUE_HIDDEN,
      },
      childNodes: [],
      isSVG,
    }
  }

  // Ignore Elements like Script and some Link, Metas
  if (nodePrivacyLevel === NodePrivacyLevel.IGNORE) {
    return
  }

  const attributes = serializeAttributes(element, nodePrivacyLevel, options)

  let childNodes: SerializedNodeWithId[] = []
  if (
    hasChildNodes(element) &&
    // Do not serialize style children as the css rules are already in the _cssText attribute
    tagName !== 'style'
  ) {
    // OBJECT POOLING OPTIMIZATION:
    // We should not create a new object systematically as it could impact performances. Try to reuse
    // the same object as much as possible, and clone it only if we need to.
    let childNodesSerializationOptions
    if (options.parentNodePrivacyLevel === nodePrivacyLevel && options.ignoreWhiteSpace === (tagName === 'head')) {
      childNodesSerializationOptions = options
    } else {
      childNodesSerializationOptions = assign({}, options, {
        parentNodePrivacyLevel: nodePrivacyLevel,
        ignoreWhiteSpace: tagName === 'head',
      })
    }
    childNodes = serializeChildNodes(element, childNodesSerializationOptions)
  }

  return {
    type: NodeType.Element,
    tagName,
    attributes,
    childNodes,
    isSVG,
  }
}

function isSVGElement(el: Element): boolean {
  return el.tagName === 'svg' || el instanceof SVGElement
}

/**
 * Text Nodes are dependant on Element nodes
 * Privacy levels are set on elements so we check the parentElement of a text node
 * for privacy level.
 */

function serializeTextNode(textNode: Text, options: SerializeOptions): TextNode | undefined {
  const textContent = getTextContent(textNode, options.ignoreWhiteSpace || false, options.parentNodePrivacyLevel)
  if (textContent === undefined) {
    return
  }
  return {
    type: NodeType.Text,
    textContent,
  }
}

function serializeCDataNode(): CDataNode {
  return {
    type: NodeType.CDATA,
    textContent: '',
  }
}
