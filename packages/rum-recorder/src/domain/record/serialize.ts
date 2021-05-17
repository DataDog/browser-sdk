import { PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_HIDDEN } from '../../constants'
import { nodeShouldBeHidden } from './privacy'
import {
  SerializedNode,
  SerializedNodeWithId,
  NodeType,
  Attributes,
  DocumentNode,
  DocumentTypeNode,
  ElementNode,
  TextNode,
  CDataNode,
} from './types'
import {
  makeStylesheetUrlsAbsolute,
  getSerializedNodeId,
  setSerializedNode,
  transformAttribute,
} from './serializationUtils'
import { forEach } from './utils'

interface SerializeOptions {
  document: Document
  serializedNodeIds?: Set<number>
  ignoreWhiteSpace?: boolean
}

export function serializeDocument(document: Document): SerializedNodeWithId {
  // We are sure that Documents are never ignored, so this function never returns null
  return serializeNodeWithId(document, {
    document,
  })!
}

export function serializeNodeWithId(n: Node, options: SerializeOptions): SerializedNodeWithId | null {
  const serializedNode = serializeNode(n, options)
  if (!serializedNode) {
    return null
  }

  // Try to reuse the previous id
  const id = getSerializedNodeId(n) || generateNextId()
  const serializedNodeWithId = serializedNode as SerializedNodeWithId
  serializedNodeWithId.id = id
  setSerializedNode(n, serializedNodeWithId)
  if (options.serializedNodeIds) {
    options.serializedNodeIds.add(id)
  }
  return serializedNodeWithId
}

function serializeNode(n: Node, options: SerializeOptions): SerializedNode | undefined {
  switch (n.nodeType) {
    case n.DOCUMENT_NODE:
      return serializeDocumentNode(n as Document, options)
    case n.DOCUMENT_TYPE_NODE:
      return serializeDocumentTypeNode(n as DocumentType)
    case n.ELEMENT_NODE:
      return serializeElementNode(n as Element, options)
    case n.TEXT_NODE:
      return serializeTextNode(n as Text, options)
    case n.CDATA_SECTION_NODE:
      return serializeCDataNode()
  }
}

function serializeDocumentNode(document: Document, options: SerializeOptions): DocumentNode {
  return {
    type: NodeType.Document,
    childNodes: serializeChildNodes(document, options),
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

function serializeElementNode(element: Element, options: SerializeOptions): ElementNode | undefined {
  const tagName = getValidTagName(element.tagName)
  const isSVG = isSVGElement(element) || undefined

  if (shouldIgnoreElement(element)) {
    return
  }

  if (nodeShouldBeHidden(element)) {
    const { width, height } = element.getBoundingClientRect()
    return {
      type: NodeType.Element,
      tagName,
      attributes: {
        id: element.id,
        class: element.className,
        rr_width: `${width}px`,
        rr_height: `${height}px`,
        [PRIVACY_ATTR_NAME]: PRIVACY_ATTR_VALUE_HIDDEN,
      },
      childNodes: [],
      isSVG,
    }
  }

  const attributes: Attributes = {}
  for (const { name, value } of Array.from(element.attributes)) {
    attributes[name] = transformAttribute(options.document, name, value)
  }
  // remote css
  if (tagName === 'link') {
    const stylesheet = Array.from(options.document.styleSheets).find(
      (s) => s.href === (element as HTMLLinkElement).href
    )
    const cssText = getCssRulesString(stylesheet as CSSStyleSheet)
    if (cssText) {
      delete attributes.rel
      delete attributes.href
      attributes._cssText = makeStylesheetUrlsAbsolute(cssText, stylesheet!.href!)
    }
  }
  // dynamic stylesheet
  if (
    tagName === 'style' &&
    (element as HTMLStyleElement).sheet &&
    // TODO: Currently we only try to get dynamic stylesheet when it is an empty style element
    !((element as HTMLStyleElement).innerText || element.textContent || '').trim().length
  ) {
    const cssText = getCssRulesString((element as HTMLStyleElement).sheet as CSSStyleSheet)
    if (cssText) {
      attributes._cssText = makeStylesheetUrlsAbsolute(cssText, location.href)
    }
  }
  // form fields
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    const value = (element as HTMLInputElement | HTMLTextAreaElement).value
    if (
      attributes.type !== 'radio' &&
      attributes.type !== 'checkbox' &&
      attributes.type !== 'submit' &&
      attributes.type !== 'button' &&
      value
    ) {
      attributes.value = value
    } else if ((element as HTMLInputElement).checked) {
      attributes.checked = (element as HTMLInputElement).checked
    }
  }
  if (tagName === 'option') {
    const selectValue = (element as HTMLOptionElement).parentElement
    if (attributes.value === (selectValue as HTMLSelectElement).value) {
      attributes.selected = (element as HTMLOptionElement).selected
    }
  }
  // media elements
  if (tagName === 'audio' || tagName === 'video') {
    attributes.rr_mediaState = (element as HTMLMediaElement).paused ? 'paused' : 'played'
  }
  // scroll
  if (element.scrollLeft) {
    attributes.rr_scrollLeft = Math.round(element.scrollLeft)
  }
  if (element.scrollTop) {
    attributes.rr_scrollTop = Math.round(element.scrollTop)
  }

  return {
    type: NodeType.Element,
    tagName,
    attributes,
    childNodes: serializeChildNodes(element, tagName === 'head' ? { ...options, ignoreWhiteSpace: true } : options),
    isSVG,
  }
}

function shouldIgnoreElement(element: Element) {
  if (element.nodeName === 'SCRIPT') {
    return true
  }

  if (element.nodeName === 'LINK') {
    const relAttribute = getLowerCaseAttribute('rel')
    return (
      // Scripts
      (relAttribute === 'preload' && getLowerCaseAttribute('as') === 'script') ||
      // Favicons
      relAttribute === 'shortcut icon' ||
      relAttribute === 'icon'
    )
  }

  if (element.nodeName === 'META') {
    const nameAttribute = getLowerCaseAttribute('name')
    const relAttribute = getLowerCaseAttribute('rel')
    const propertyAttribute = getLowerCaseAttribute('property')
    return (
      // Favicons
      /^msapplication-tile(image|color)$/.test(nameAttribute) ||
      nameAttribute === 'application-name' ||
      relAttribute === 'icon' ||
      relAttribute === 'apple-touch-icon' ||
      relAttribute === 'shortcut icon' ||
      // Description
      nameAttribute === 'keywords' ||
      nameAttribute === 'description' ||
      // Social
      /^(og|twitter|fb):/.test(propertyAttribute) ||
      /^(og|twitter):/.test(nameAttribute) ||
      nameAttribute === 'pinterest' ||
      // Robots
      nameAttribute === 'robots' ||
      nameAttribute === 'googlebot' ||
      nameAttribute === 'bingbot' ||
      // Http headers. Ex: X-UA-Compatible, Content-Type, Content-Language, cache-control,
      // X-Translated-By
      element.hasAttribute('http-equiv') ||
      // Authorship
      nameAttribute === 'author' ||
      nameAttribute === 'generator' ||
      nameAttribute === 'framework' ||
      nameAttribute === 'publisher' ||
      nameAttribute === 'progid' ||
      /^article:/.test(propertyAttribute) ||
      /^product:/.test(propertyAttribute) ||
      // Verification
      nameAttribute === 'google-site-verification' ||
      nameAttribute === 'yandex-verification' ||
      nameAttribute === 'csrf-token' ||
      nameAttribute === 'p:domain_verify' ||
      nameAttribute === 'verify-v1' ||
      nameAttribute === 'verification' ||
      nameAttribute === 'shopify-checkout-api-token'
    )
  }

  function getLowerCaseAttribute(name: string) {
    return (element.getAttribute(name) || '').toLowerCase()
  }

  return false
}

function serializeTextNode(text: Text, options: SerializeOptions): TextNode | undefined {
  // The parent node may not be a html element which has a tagName attribute.
  // So just let it be undefined which is ok in this use case.
  const parentTagName = text.parentNode && (text.parentNode as HTMLElement).tagName
  let textContent = text.textContent || ''
  const isStyle = parentTagName === 'STYLE' ? true : undefined
  if (isStyle) {
    textContent = makeStylesheetUrlsAbsolute(textContent, location.href)
  } else if (options.ignoreWhiteSpace && !textContent.trim()) {
    return
  }
  return {
    type: NodeType.Text,
    textContent,
    isStyle,
  }
}

function serializeCDataNode(): CDataNode {
  return {
    type: NodeType.CDATA,
    textContent: '',
  }
}

function serializeChildNodes(node: Node, options: SerializeOptions): SerializedNodeWithId[] {
  const result: SerializedNodeWithId[] = []
  forEach(node.childNodes, (childNode) => {
    const serializedChildNode = serializeNodeWithId(childNode, options)
    if (serializedChildNode) {
      result.push(serializedChildNode)
    }
  })
  return result
}

let nextId = 1
function generateNextId(): number {
  return nextId++
}

const TAG_NAME_REGEX = /[^a-z1-6-_]/
function getValidTagName(tagName: string): string {
  const processedTagName = tagName.toLowerCase().trim()

  if (TAG_NAME_REGEX.test(processedTagName)) {
    // if the tag name is odd and we cannot extract
    // anything from the string, then we return a
    // generic div
    return 'div'
  }

  return processedTagName
}

function getCssRulesString(s: CSSStyleSheet): string | null {
  try {
    const rules = s.rules || s.cssRules
    return rules ? Array.from(rules).map(getCssRuleString).join('') : null
  } catch (error) {
    return null
  }
}

function getCssRuleString(rule: CSSRule): string {
  return isCSSImportRule(rule) ? getCssRulesString(rule.styleSheet) || '' : rule.cssText
}

function isCSSImportRule(rule: CSSRule): rule is CSSImportRule {
  return 'styleSheet' in rule
}

function isSVGElement(el: Element): boolean {
  return el.tagName === 'svg' || el instanceof SVGElement
}
