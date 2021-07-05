import { objectEntries } from 'packages/core/src/tools/utils'
import {
  // CensorshipLevel,
  NodeCensorshipTag,
  InputPrivacyMode,
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_HIDDEN,
  CENSORED_STRING_MARK,
} from '../../constants'
import {
  getNodeInputPrivacyMode,
  nodeShouldBeHidden,
  censorText,
  // nodeOrAncestorsShouldBeHidden,
  getNodeInheritedCensorshipLevel,
  getAttributesForPrivacyLevel,
  shuffle,
} from './privacy'
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
  getElementInputValue,
  // getCensorshipLevel,
  // maskValue,
} from './serializationUtils'
import { forEach } from './utils'

export interface SerializeOptions {
  document: Document
  serializedNodeIds?: Set<number>
  ignoreWhiteSpace?: boolean
  ancestorInputPrivacyMode: InputPrivacyMode
}

export function serializeDocument(document: Document): SerializedNodeWithId {
  // We are sure that Documents are never ignored, so this function never returns null
  // TODO: NOTE: This only affects `input`, not general HTML text blocking
  const defaultPrivacyMode = InputPrivacyMode.NONE // TODO: get DEFAULT privacy mode, set to MASKED?
  return serializeNodeWithId(document, {
    document,
    ancestorInputPrivacyMode: defaultPrivacyMode,
  })!
}

export function serializeNodeWithId(node: Node, options: SerializeOptions): SerializedNodeWithId | null {
  const serializedNode = serializeNode(node, options)
  if (!serializedNode) {
    return null
  }

  // Try to reuse the previous id
  const id = getSerializedNodeId(node) || generateNextId()
  const serializedNodeWithId = serializedNode as SerializedNodeWithId
  serializedNodeWithId.id = id
  setSerializedNode(node, serializedNodeWithId)
  if (options.serializedNodeIds) {
    options.serializedNodeIds.add(id)
  }
  return serializedNodeWithId
}

function serializeNode(node: Node, options: SerializeOptions): SerializedNode | undefined {
  switch (node.nodeType) {
    case node.DOCUMENT_NODE:
      return serializeDocumentNode(node as Document, options)
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
  const nodePrivacyLevel = getNodeInheritedCensorshipLevel(element)

  // TODO: WHY IS THIS NOT nodeOrAncestorsShouldBeHidden() ???? Also make the function private
  // if (nodeShouldBeHidden(element)) {
  if (nodePrivacyLevel === NodeCensorshipTag.HIDDEN) {
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

  // Ignore Elements like Script and some Link, Metas
  // if (shouldIgnoreElement(element)) {
  if (nodePrivacyLevel === NodeCensorshipTag.IGNORE) {
    // TODO: We should still record ignored elements, just not their textNode content.
    // TODO: On the record OR replay side, we should prefix the tagName so it has no effect.
    return
  }

  const attributes = getAttributesForPrivacyLevel(element, nodePrivacyLevel)
  objectEntries(attributes).forEach(([name, value]) => {
    const attrValue = value as string
    // Add domains to relative URLs
    attributes[name] = transformAttribute(options.document, name, attrValue)
  })

  // const attributes: Attributes = {}
  // // TODO: getAttributesForPrivacyLevel(element, nodePrivacyLevel)
  // for (const { name, value } of Array.from(element.attributes)) {
  //   // Never take those attributes into account, as they will be conditionally set below.
  //   if (name === 'value' || name === 'selected' || name === 'checked') {
  //     continue
  //   }
  //   attributes[name] = transformAttribute(options.document, name, value)
  // }

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

  // Form fields: INPUT/OPTION/SELECT/TEXTAREA
  if (nodePrivacyLevel === NodeCensorshipTag.ALLOW) {
    const value = getElementInputValue(element, options.ancestorInputPrivacyMode)
    if (value) {
      attributes.value = value
    }

    if (tagName === 'option') {
      const selectElement = (element as HTMLOptionElement).parentElement
      if ((element as HTMLOptionElement).value === (selectElement as HTMLSelectElement).value) {
        attributes.selected = (element as HTMLOptionElement).selected
      }
    }
    if (tagName === 'input' && (element as HTMLInputElement).checked) {
      attributes.checked = true
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

  let childNodes: SerializedNodeWithId[]

  if (element.childNodes.length) {
    let childNodesSerializationOptions = options

    // We should not create a new object systematically as it could impact performances. Try to reuse
    // the same object as much as possible, and clone it only if we need to.
    if (tagName === 'head') {
      childNodesSerializationOptions = { ...childNodesSerializationOptions, ignoreWhiteSpace: true }
    }

    const inputPrivacyMode = getNodeInputPrivacyMode(element, options.ancestorInputPrivacyMode)
    if (inputPrivacyMode !== options.ancestorInputPrivacyMode) {
      childNodesSerializationOptions = { ...childNodesSerializationOptions, ancestorInputPrivacyMode: inputPrivacyMode }
    }

    childNodes = serializeChildNodes(element, childNodesSerializationOptions)
  } else {
    childNodes = []
  }

  if (
    // To enhance privacy, we shuffle the
    nodePrivacyLevel === NodeCensorshipTag.MASK &&
    (tagName === 'DATALIST' || tagName === 'SELECT' || tagName === 'OPTGROUP')
  ) {
    shuffle<SerializedNodeWithId>(childNodes)
  }

  return {
    type: NodeType.Element,
    tagName,
    attributes,
    childNodes,
    isSVG,
  }
}
;(window as any).serializeElementNode = serializeElementNode
;(window as any).getAttributesForPrivacyLevel = getAttributesForPrivacyLevel

export function shouldIgnoreElement(element: Element): boolean {
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

function serializeTextNode(textNode: Text, options: SerializeOptions): TextNode | undefined {
  // The parent node may not be a html element which has a tagName attribute.
  // So just let it be undefined which is ok in this use case.
  const parentTagName = textNode.parentNode && (textNode.parentNode as HTMLElement).tagName
  let textContent = textNode.textContent || ''

  const isStyle = parentTagName === 'STYLE' ? true : undefined
  if (isStyle) {
    textContent = makeStylesheetUrlsAbsolute(textContent, location.href)
  } else if (options.ignoreWhiteSpace && !textContent.trim()) {
    return
  } else {
    // if (nodeOrAncestorsShouldBeHidden(textNode)) {
    const nodePrivacyLevel = getNodeInheritedCensorshipLevel(textNode)
    if (nodePrivacyLevel === NodeCensorshipTag.HIDDEN) {
      // TODO: now test
      textContent = CENSORED_STRING_MARK
    } else if (nodePrivacyLevel === NodeCensorshipTag.MASK) {
      textContent = censorText(textContent)
    }
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
