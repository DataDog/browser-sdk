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
import type {
  DocumentFragmentNode,
  DocumentNode,
  SerializedNodeWithId,
  CDataNode,
  DocumentTypeNode,
  ElementNode,
  TextNode,
} from '../../../types'
import { NodeType } from '../../../types'
import { getValidTagName } from './serializationUtils'
import type { ParentNodePrivacyLevel } from './serialization.types'
import { serializeStyleSheets } from './serializeStyleSheets'
import { serializeAttributes } from './serializeAttributes'
import type { SerializationTransaction } from './serializationTransaction'

export function serializeNode(
  node: Element,
  parentNodePrivacyLevel: ParentNodePrivacyLevel,
  transaction: SerializationTransaction
): (SerializedNodeWithId & ElementNode) | null
export function serializeNode(
  node: Node,
  parentNodePrivacyLevel: ParentNodePrivacyLevel,
  transaction: SerializationTransaction
): SerializedNodeWithId | null
export function serializeNode(
  node: Node,
  parentNodePrivacyLevel: ParentNodePrivacyLevel,
  transaction: SerializationTransaction
): SerializedNodeWithId | null {
  switch (node.nodeType) {
    case node.DOCUMENT_NODE:
      return serializeDocumentNode(node as Document, parentNodePrivacyLevel, transaction)
    case node.DOCUMENT_FRAGMENT_NODE:
      return serializeDocumentFragmentNode(node as DocumentFragment, parentNodePrivacyLevel, transaction)
    case node.DOCUMENT_TYPE_NODE:
      return serializeDocumentTypeNode(node as DocumentType, transaction)
    case node.ELEMENT_NODE:
      return serializeElementNode(node as Element, parentNodePrivacyLevel, transaction)
    case node.TEXT_NODE:
      return serializeTextNode(node as Text, parentNodePrivacyLevel, transaction)
    case node.CDATA_SECTION_NODE:
      return serializeCDataNode(node as CDATASection, transaction)
    default:
      return null
  }
}

export function serializeChildNodes(
  node: Node,
  parentNodePrivacyLevel: ParentNodePrivacyLevel,
  transaction: SerializationTransaction
): SerializedNodeWithId[] {
  const result: SerializedNodeWithId[] = []
  forEachChildNodes(node, (childNode) => {
    const serializedChildNode = serializeNode(childNode, parentNodePrivacyLevel, transaction)
    if (serializedChildNode) {
      result.push(serializedChildNode)
    }
  })
  return result
}

export function serializeDocumentNode(
  document: Document,
  parentNodePrivacyLevel: ParentNodePrivacyLevel,
  transaction: SerializationTransaction
): DocumentNode & SerializedNodeWithId {
  return {
    type: NodeType.Document,
    id: transaction.assignId(document),
    childNodes: serializeChildNodes(document, parentNodePrivacyLevel, transaction),
    adoptedStyleSheets: serializeStyleSheets(document.adoptedStyleSheets),
  }
}

function serializeDocumentFragmentNode(
  element: DocumentFragment,
  parentNodePrivacyLevel: ParentNodePrivacyLevel,
  transaction: SerializationTransaction
): DocumentFragmentNode & SerializedNodeWithId {
  const isShadowRoot = isNodeShadowRoot(element)
  if (isShadowRoot) {
    transaction.scope.shadowRootsController.addShadowRoot(element, transaction.scope)
  }

  return {
    type: NodeType.DocumentFragment,
    id: transaction.assignId(element),
    childNodes: serializeChildNodes(element, parentNodePrivacyLevel, transaction),
    isShadowRoot,
    adoptedStyleSheets: isShadowRoot ? serializeStyleSheets(element.adoptedStyleSheets) : undefined,
  }
}

function serializeDocumentTypeNode(
  documentType: DocumentType,
  transaction: SerializationTransaction
): DocumentTypeNode & SerializedNodeWithId {
  return {
    type: NodeType.DocumentType,
    id: transaction.assignId(documentType),
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

function serializeElementNode(
  element: Element,
  parentNodePrivacyLevel: ParentNodePrivacyLevel,
  transaction: SerializationTransaction
): (ElementNode & SerializedNodeWithId) | null {
  const tagName = getValidTagName(element.tagName)
  const isSVG = isSVGElement(element) || undefined

  // For performance reason, we don't use getNodePrivacyLevel directly: we leverage the
  // parentNodePrivacyLevel option to avoid iterating over all parents
  const nodePrivacyLevel = reducePrivacyLevel(getNodeSelfPrivacyLevel(element), parentNodePrivacyLevel)

  if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
    const { width, height } = element.getBoundingClientRect()
    return {
      type: NodeType.Element,
      id: transaction.assignId(element),
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
    return null
  }

  const id = transaction.assignId(element)
  const attributes = serializeAttributes(element, nodePrivacyLevel, transaction)

  let childNodes: SerializedNodeWithId[] = []
  if (
    hasChildNodes(element) &&
    // Do not serialize style children as the css rules are already in the _cssText attribute
    tagName !== 'style'
  ) {
    childNodes = serializeChildNodes(element, nodePrivacyLevel, transaction)
  }

  return {
    type: NodeType.Element,
    id,
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

function serializeTextNode(
  textNode: Text,
  parentNodePrivacyLevel: ParentNodePrivacyLevel,
  transaction: SerializationTransaction
): (TextNode & SerializedNodeWithId) | null {
  const textContent = getTextContent(textNode, parentNodePrivacyLevel)
  if (textContent === undefined) {
    return null
  }
  return {
    type: NodeType.Text,
    id: transaction.assignId(textNode),
    textContent,
  }
}

function serializeCDataNode(
  node: CDATASection,
  transaction: SerializationTransaction
): CDataNode & SerializedNodeWithId {
  return {
    type: NodeType.CDATA,
    id: transaction.assignId(node),
    textContent: '',
  }
}
