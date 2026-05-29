import {
  reducePrivacyLevel,
  getNodeSelfPrivacyLevel,
  getTextContent,
  isNodeShadowRoot,
  forEachChildNodes,
  NodePrivacyLevel,
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_HIDDEN,
  getScrollX,
  getScrollY,
  isElementNode,
} from '@datadog/browser-rum-core'
import { MediaInteractionType } from '../../../types'
import type { NodeId, StyleSheetId } from '../itemIds'
import type { InsertionCursor } from './insertionCursor'
import type { SerializationTransaction } from './serializationTransaction'
import { serializeDOMAttributes, serializeVirtualAttributes } from './serializeAttributes'

export function serializeNode(
  cursor: InsertionCursor,
  node: Node,
  parentPrivacyLevel: NodePrivacyLevel,
  transaction: SerializationTransaction
): void {
  // Ignore the children of <style> elements; the CSS rules they contain are already
  // serialized as StyleSheetSnapshots.
  if (node.parentNode?.nodeName === 'STYLE') {
    return
  }

  // Never serialize the descendants of HIDDEN or IGNORE'd elements.
  if (parentPrivacyLevel === NodePrivacyLevel.HIDDEN || parentPrivacyLevel === NodePrivacyLevel.IGNORE) {
    return
  }

  let privacyLevel: NodePrivacyLevel

  const selfPrivacyLevel = getNodeSelfPrivacyLevel(node)
  if (selfPrivacyLevel) {
    privacyLevel = reducePrivacyLevel(selfPrivacyLevel, parentPrivacyLevel)
  } else {
    privacyLevel = parentPrivacyLevel
  }

  if (privacyLevel === NodePrivacyLevel.HIDDEN) {
    serializeHiddenNodePlaceholder(cursor, node, transaction)
    return
  }

  // Totally ignore risky or unwanted elements. (e.g. <script>, some <link> and <meta> elements)
  if (privacyLevel === NodePrivacyLevel.IGNORE) {
    return
  }

  switch (node.nodeType) {
    case node.CDATA_SECTION_NODE:
      serializeCDataNode(cursor, node as CDATASection, transaction)
      break
    case node.DOCUMENT_NODE:
      serializeDocumentNode(cursor, node as Document, transaction)
      break
    case node.DOCUMENT_FRAGMENT_NODE:
      serializeDocumentFragmentNode(cursor, node as DocumentFragment, transaction)
      break
    case node.DOCUMENT_TYPE_NODE:
      serializeDocumentTypeNode(cursor, node as DocumentType, transaction)
      break
    case node.ELEMENT_NODE:
      serializeElementNode(cursor, node as Element, privacyLevel, transaction)
      break
    case node.TEXT_NODE:
      serializeTextNode(cursor, node as Text, privacyLevel, transaction)
      break
    default:
      return
  }

  // If this node can't have children, we're done.
  switch (node.nodeType) {
    case node.CDATA_SECTION_NODE:
    case node.DOCUMENT_TYPE_NODE:
    case node.TEXT_NODE:
      return
  }

  cursor.descend()
  forEachChildNodes(node, (childNode) => {
    serializeNode(cursor, childNode, privacyLevel, transaction)
  })
  cursor.ascend()
}

function serializeDocumentNode(
  cursor: InsertionCursor,
  document: Document,
  transaction: SerializationTransaction
): void {
  const { nodeId, insertionPoint } = cursor.advance(document)
  transaction.addNode(insertionPoint, '#document')
  transaction.setScrollPosition(nodeId, getScrollX(), getScrollY())
  serializeStyleSheets(document.adoptedStyleSheets, nodeId, transaction)
}

function serializeDocumentFragmentNode(
  cursor: InsertionCursor,
  documentFragment: DocumentFragment,
  transaction: SerializationTransaction
): void {
  const { nodeId, insertionPoint } = cursor.advance(documentFragment)
  const isShadowRoot = isNodeShadowRoot(documentFragment)
  if (!isShadowRoot) {
    transaction.addNode(insertionPoint, '#document-fragment')
    return
  }

  transaction.addNode(insertionPoint, '#shadow-root')
  transaction.scope.shadowRootsController.addShadowRoot(documentFragment, transaction.scope)
  serializeStyleSheets(documentFragment.adoptedStyleSheets, nodeId, transaction)
}

function serializeDocumentTypeNode(
  cursor: InsertionCursor,
  documentType: DocumentType,
  transaction: SerializationTransaction
): void {
  const { insertionPoint } = cursor.advance(documentType)
  transaction.addNode(insertionPoint, '#doctype', documentType.name, documentType.publicId, documentType.systemId)
}

function serializeElementNode(
  cursor: InsertionCursor,
  element: Element,
  privacyLevel: NodePrivacyLevel,
  transaction: SerializationTransaction
): void {
  const { nodeId, insertionPoint } = cursor.advance(element)
  const domAttributes = Object.entries(serializeDOMAttributes(element, privacyLevel, transaction))
  transaction.addNode(insertionPoint, encodedElementName(element), ...domAttributes)

  const {
    _cssText: cssText,
    rr_mediaState: mediaState,
    rr_scrollLeft: scrollLeft,
    rr_scrollTop: scrollTop,
  } = serializeVirtualAttributes(element, privacyLevel, transaction)

  const linkOrStyle = element as HTMLLinkElement | HTMLStyleElement
  if (cssText !== undefined && linkOrStyle.sheet) {
    const sheetId = transaction.scope.styleSheetIds.getOrInsert(linkOrStyle.sheet)
    transaction.addStyleSheet(cssText)
    transaction.attachStyleSheets(nodeId, [sheetId])
  }

  if (mediaState === 'played') {
    transaction.setMediaPlaybackState(nodeId, MediaInteractionType.Play)
  } else if (mediaState === 'paused') {
    transaction.setMediaPlaybackState(nodeId, MediaInteractionType.Pause)
  }

  if (scrollLeft !== undefined || scrollTop !== undefined) {
    transaction.setScrollPosition(nodeId, scrollLeft || 0, scrollTop || 0)
  }
}

function serializeTextNode(
  cursor: InsertionCursor,
  textNode: Text,
  privacyLevel: NodePrivacyLevel,
  transaction: SerializationTransaction
): void {
  const { insertionPoint } = cursor.advance(textNode)
  const textContent = getTextContent(textNode, privacyLevel)
  transaction.addNode(insertionPoint, '#text', textContent)
}

function serializeCDataNode(
  cursor: InsertionCursor,
  cdataNode: CDATASection,
  transaction: SerializationTransaction
): void {
  const { insertionPoint } = cursor.advance(cdataNode)
  transaction.addNode(insertionPoint, '#cdata-section')
}

function serializeHiddenNodePlaceholder(
  cursor: InsertionCursor,
  node: Node,
  transaction: SerializationTransaction
): void {
  // We only generate placeholders for element nodes; other hidden nodes are simply not
  // serialized. (But note that a non-element node can only be hidden if it's a descendant
  // of another hidden node, since only element nodes can have a different privacy level
  // than their parent.)
  if (!isElementNode(node)) {
    return
  }

  const { nodeId, insertionPoint } = cursor.advance(node)
  transaction.addNode(insertionPoint, encodedElementName(node), [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_HIDDEN])
  const { width, height } = node.getBoundingClientRect()
  transaction.setSize(nodeId, width, height)
}

function serializeStyleSheets(
  sheets: CSSStyleSheet[] | undefined,
  nodeId: NodeId,
  transaction: SerializationTransaction
): void {
  if (!sheets || sheets.length === 0) {
    return undefined
  }

  transaction.attachStyleSheets(
    nodeId,
    sheets.map((sheet) => serializeStyleSheet(sheet, transaction))
  )
}

function serializeStyleSheet(sheet: CSSStyleSheet, transaction: SerializationTransaction): StyleSheetId {
  const rules = Array.from(sheet.cssRules || sheet.rules, (rule) => rule.cssText)
  const mediaList = sheet.media.length > 0 ? Array.from(sheet.media) : undefined
  transaction.addMetric(
    'cssText',
    rules.reduce((totalLength, rule) => totalLength + rule.length, 0)
  )
  transaction.addStyleSheet(rules, mediaList, sheet.disabled)
  return transaction.scope.styleSheetIds.getOrInsert(sheet)
}

function encodedElementName(element: Element): Exclude<string, `#${string}`> {
  const nodeName = element.nodeName
  if (isSVGElement(element)) {
    return `svg>${nodeName}`
  }
  return nodeName
}

function isSVGElement(element: Element): element is SVGElement {
  return element.namespaceURI === 'http://www.w3.org/2000/svg'
}
