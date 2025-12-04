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
  SerializedNode,
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

export function serializeNodeWithId(
  node: Element,
  parentNodePrivacyLevel: ParentNodePrivacyLevel,
  transaction: SerializationTransaction
): (SerializedNodeWithId & ElementNode) | null
export function serializeNodeWithId(
  node: Node,
  parentNodePrivacyLevel: ParentNodePrivacyLevel,
  transaction: SerializationTransaction
): SerializedNodeWithId | null
export function serializeNodeWithId(
  node: Node,
  parentNodePrivacyLevel: ParentNodePrivacyLevel,
  transaction: SerializationTransaction
): SerializedNodeWithId | null {
  const serializedNode = serializeNode(node, parentNodePrivacyLevel, transaction)
  if (!serializedNode) {
    return null
  }

  const id = transaction.scope.nodeIds.assign(node)
  const serializedNodeWithId = serializedNode as SerializedNodeWithId
  serializedNodeWithId.id = id
  if (transaction.serializedNodeIds) {
    transaction.serializedNodeIds.add(id)
  }
  return serializedNodeWithId
}

export function serializeChildNodes(
  node: Node,
  parentNodePrivacyLevel: ParentNodePrivacyLevel,
  transaction: SerializationTransaction
): SerializedNodeWithId[] {
  const result: SerializedNodeWithId[] = []
  forEachChildNodes(node, (childNode) => {
    const serializedChildNode = serializeNodeWithId(childNode, parentNodePrivacyLevel, transaction)
    if (serializedChildNode) {
      result.push(serializedChildNode)
    }
  })
  return result
}

function serializeNode(
  node: Node,
  parentNodePrivacyLevel: ParentNodePrivacyLevel,
  transaction: SerializationTransaction
): SerializedNode | undefined {
  switch (node.nodeType) {
    case node.DOCUMENT_NODE:
      return serializeDocumentNode(node as Document, parentNodePrivacyLevel, transaction)
    case node.DOCUMENT_FRAGMENT_NODE:
      return serializeDocumentFragmentNode(node as DocumentFragment, parentNodePrivacyLevel, transaction)
    case node.DOCUMENT_TYPE_NODE:
      return serializeDocumentTypeNode(node as DocumentType)
    case node.ELEMENT_NODE:
      return serializeElementNode(node as Element, parentNodePrivacyLevel, transaction)
    case node.TEXT_NODE:
      return serializeTextNode(node as Text, parentNodePrivacyLevel)
    case node.CDATA_SECTION_NODE:
      return serializeCDataNode()
  }
}

export function serializeDocumentNode(
  document: Document,
  parentNodePrivacyLevel: ParentNodePrivacyLevel,
  transaction: SerializationTransaction
): DocumentNode {
  return {
    type: NodeType.Document,
    childNodes: serializeChildNodes(document, parentNodePrivacyLevel, transaction),
    adoptedStyleSheets: serializeStyleSheets(document.adoptedStyleSheets),
  }
}

function serializeDocumentFragmentNode(
  element: DocumentFragment,
  parentNodePrivacyLevel: ParentNodePrivacyLevel,
  transaction: SerializationTransaction
): DocumentFragmentNode | undefined {
  const isShadowRoot = isNodeShadowRoot(element)
  if (isShadowRoot) {
    transaction.scope.shadowRootsController.addShadowRoot(element, transaction.scope)
  }

  return {
    type: NodeType.DocumentFragment,
    childNodes: serializeChildNodes(element, parentNodePrivacyLevel, transaction),
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

function serializeElementNode(
  element: Element,
  parentNodePrivacyLevel: ParentNodePrivacyLevel,
  transaction: SerializationTransaction
): ElementNode | undefined {
  const tagName = getValidTagName(element.tagName)
  const isSVG = isSVGElement(element) || undefined

  // For performance reason, we don't use getNodePrivacyLevel directly: we leverage the
  // parentNodePrivacyLevel option to avoid iterating over all parents
  const nodePrivacyLevel = reducePrivacyLevel(getNodeSelfPrivacyLevel(element), parentNodePrivacyLevel)

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

function serializeTextNode(textNode: Text, parentNodePrivacyLevel: ParentNodePrivacyLevel): TextNode | undefined {
  const textContent = getTextContent(textNode, parentNodePrivacyLevel)
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
