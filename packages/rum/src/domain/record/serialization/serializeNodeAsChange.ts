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
import type { ChangeSerializationTransaction } from './serializationTransaction'
import { serializeDOMAttributes, serializeVirtualAttributes } from './serializeAttributes'

export function serializeNodeAsChange(
  cursor: InsertionCursor,
  node: Node,
  parentPrivacyLevel: NodePrivacyLevel,
  transaction: ChangeSerializationTransaction
): void {
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
      serializeCDataNodeAsChange(cursor, node as CDATASection, transaction)
      break
    case node.DOCUMENT_NODE:
      serializeDocumentNodeAsChange(cursor, node as Document, transaction)
      break
    case node.DOCUMENT_FRAGMENT_NODE:
      serializeDocumentFragmentNodeAsChange(cursor, node as DocumentFragment, transaction)
      break
    case node.DOCUMENT_TYPE_NODE:
      serializeDocumentTypeNodeAsChange(cursor, node as DocumentType, transaction)
      break
    case node.ELEMENT_NODE:
      serializeElementNodeAsChange(cursor, node as Element, privacyLevel, transaction)
      break
    case node.TEXT_NODE:
      serializeTextNodeAsChange(cursor, node as Text, privacyLevel, transaction)
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

  // Ignore the children of <style> elements; the CSS rules they contain are already
  // serialized as StyleSheetSnapshots.
  if (node.nodeName === 'STYLE') {
    return
  }

  cursor.descend()
  forEachChildNodes(node, (childNode) => {
    serializeNodeAsChange(cursor, childNode, privacyLevel, transaction)
  })
  cursor.ascend()
}

function serializeDocumentNodeAsChange(
  cursor: InsertionCursor,
  document: Document,
  transaction: ChangeSerializationTransaction
): void {
  const { nodeId, insertionPoint } = cursor.advance(document)
  transaction.addNode(insertionPoint, '#document')
  transaction.setScrollPosition(nodeId, getScrollX(), getScrollY())
  serializeStyleSheetsAsChange(document.adoptedStyleSheets, nodeId, transaction)
}

function serializeDocumentFragmentNodeAsChange(
  cursor: InsertionCursor,
  documentFragment: DocumentFragment,
  transaction: ChangeSerializationTransaction
): void {
  const { nodeId, insertionPoint } = cursor.advance(documentFragment)
  const isShadowRoot = isNodeShadowRoot(documentFragment)
  if (!isShadowRoot) {
    transaction.addNode(insertionPoint, '#document-fragment')
    return
  }

  transaction.addNode(insertionPoint, '#shadow-root')
  transaction.scope.shadowRootsController.addShadowRoot(documentFragment, transaction.scope)
  serializeStyleSheetsAsChange(documentFragment.adoptedStyleSheets, nodeId, transaction)
}

function serializeDocumentTypeNodeAsChange(
  cursor: InsertionCursor,
  documentType: DocumentType,
  transaction: ChangeSerializationTransaction
): void {
  const { insertionPoint } = cursor.advance(documentType)
  transaction.addNode(insertionPoint, '#doctype', documentType.name, documentType.publicId, documentType.systemId)
}

function serializeElementNodeAsChange(
  cursor: InsertionCursor,
  element: Element,
  privacyLevel: NodePrivacyLevel,
  transaction: ChangeSerializationTransaction
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

function serializeTextNodeAsChange(
  cursor: InsertionCursor,
  textNode: Text,
  privacyLevel: NodePrivacyLevel,
  transaction: ChangeSerializationTransaction
): void {
  const textContent = getTextContent(textNode, privacyLevel)
  if (textContent === undefined) {
    return
  }
  const { insertionPoint } = cursor.advance(textNode)
  transaction.addNode(insertionPoint, '#text', textContent)
}

function serializeCDataNodeAsChange(
  cursor: InsertionCursor,
  cdataNode: CDATASection,
  transaction: ChangeSerializationTransaction
): void {
  const { insertionPoint } = cursor.advance(cdataNode)
  transaction.addNode(insertionPoint, '#cdata-section')
}

function serializeHiddenNodePlaceholder(
  cursor: InsertionCursor,
  node: Node,
  transaction: ChangeSerializationTransaction
): void {
  // We only generate placeholders for element nodes; other hidden nodes are simply not
  // serialized.
  if (!isElementNode(node)) {
    return
  }

  const { nodeId, insertionPoint } = cursor.advance(node)
  transaction.addNode(insertionPoint, encodedElementName(node), [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_HIDDEN])
  const { width, height } = node.getBoundingClientRect()
  transaction.setSize(nodeId, width, height)
}

function serializeStyleSheetsAsChange(
  sheets: CSSStyleSheet[] | undefined,
  nodeId: NodeId,
  transaction: ChangeSerializationTransaction
): void {
  if (!sheets || sheets.length === 0) {
    return undefined
  }

  transaction.attachStyleSheets(
    nodeId,
    sheets.map((sheet) => serializeStyleSheetAsChange(sheet, transaction))
  )
}

function serializeStyleSheetAsChange(sheet: CSSStyleSheet, transaction: ChangeSerializationTransaction): StyleSheetId {
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
