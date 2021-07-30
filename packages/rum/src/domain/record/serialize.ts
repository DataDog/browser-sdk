import {
  NodePrivacyLevel,
  NodePrivacyLevelInternal,
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_HIDDEN,
  CENSORED_STRING_MARK,
} from '../../constants'
import {
  getNodePrivacyLevel,
  getAttributesForPrivacyLevel,
  remapInternalPrivacyLevels,
  getInternalNodePrivacyLevel,
  getInitialPrivacyLevel,
  getTextContent,
  shuffle,
} from './privacy'
import {
  SerializedNode,
  SerializedNodeWithId,
  NodeType,
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

export interface SerializeOptions {
  document: Document
  serializedNodeIds?: Set<number>
  ignoreWhiteSpace?: boolean
  parentNodePrivacyLevel: NodePrivacyLevelInternal
}

export function serializeDocument(document: Document): SerializedNodeWithId {
  // We are sure that Documents are never ignored, so this function never returns null
  return serializeNodeWithId(document, {
    document,
    parentNodePrivacyLevel: getInitialPrivacyLevel(),
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

export function serializeDocumentNode(document: Document, options: SerializeOptions): DocumentNode {
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

/**
 * Serialzing Element nodes involves capturing:
 * 1. HTML ATTRIBUTES:
 * 2. JS STATE:
 * - scroll offsets
 * - Form fields (input value, checkbox checked, otpion selection, range)
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
export function serializeElementNode(element: Element, options: SerializeOptions): ElementNode | undefined {
  const tagName = getValidTagName(element.tagName)
  const isSVG = isSVGElement(element) || undefined

  // We only get internal privacy level here to pass on to
  // child nodes, purely for performance reasons
  const internalPrivacyLevel = getInternalNodePrivacyLevel(element, options.parentNodePrivacyLevel)
  const nodePrivacyLevel = remapInternalPrivacyLevels(element, internalPrivacyLevel)

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
    // TODO: We should still record ignored elements, just not their textNode content.
    // TODO: On the record or replay side, we should prefix the tagName so it has no effect.
    return
  }

  const attributes = getAttributesForPrivacyLevel(element, nodePrivacyLevel)

  // Inlining ObjectEntries for perf
  const attributeKeys = Object.keys(attributes)
  for (let i = 0; i < attributeKeys.length; i += 1) {
    const attributeName = attributeKeys[i]
    const attributeValue = attributes[attributeName] as string
    // Add domains to relative URLs
    attributes[attributeName] = transformAttribute(options.document, attributeName, attributeValue)
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

  /**
   * FORMS: <input>, <select>
   * For some <input> elements, the `value` is an exceptional property/attribute that has the
   * value synced between el.value and el.getAttribute()
   * input[type=button,checkbox,hidden,image,radio,reset,submit]
   */
  const inputElement = element as HTMLInputElement
  if (tagName === 'input' && (element as HTMLInputElement).value) {
    switch (nodePrivacyLevel) {
      case NodePrivacyLevel.ALLOW:
        attributes.value = inputElement.value
        break
      case NodePrivacyLevel.MASK:
        attributes.value = CENSORED_STRING_MARK
        break
    }
  }

  /**
   * Forms: input[type=checkbox,radio]
   * The `checked` property for <input> is a little bit special:
   * 1. el.checked is a setter that returns if truthy.
   * 2. getAttribute returns the string value
   * getAttribute('checked') does not sync with `Element.checked`, so use JS property
   * NOTE: `checked` property exists on `HTMLInputElement`. For serializer assumptions, we check for type=radio|check.
   */
  if (tagName === 'input' && (inputElement.type === 'radio' || inputElement.type === 'checkbox')) {
    switch (nodePrivacyLevel) {
      case NodePrivacyLevel.ALLOW:
        attributes.checked = !!inputElement.checked
        break
      case NodePrivacyLevel.MASK:
        attributes.checked = CENSORED_STRING_MARK
        break
    }
  }

  if (tagName === 'textarea') {
    const textAreaElement = element as HTMLTextAreaElement
    // Matching empty strings is not considered selected.
    switch (nodePrivacyLevel) {
      case NodePrivacyLevel.ALLOW:
        attributes.value = textAreaElement.value
        break
      case NodePrivacyLevel.MASK:
        attributes.value = textAreaElement.value ? CENSORED_STRING_MARK : ''
        break
    }
  }

  if (tagName === 'select') {
    switch (nodePrivacyLevel) {
      case NodePrivacyLevel.ALLOW:
        attributes.value = inputElement.value
        break
      case NodePrivacyLevel.MASK:
        attributes.value = inputElement.value ? CENSORED_STRING_MARK : ''
        break
    }
  }

  /**
   * <Option> can be selected, which occurs if its `value` matches ancestor `<Select>.value`
   */
  if (tagName === 'option' && nodePrivacyLevel === NodePrivacyLevel.ALLOW) {
    // For privacy=`MASK`, all the values would be the same, so skip.
    const optionElement = element as HTMLOptionElement
    if (optionElement.selected) {
      attributes.selected = optionElement.selected
    }
    attributes.value = optionElement.value
  }

  /**
   * Serialize the media playback state
   */
  if (tagName === 'audio' || tagName === 'video') {
    const mediaElement = element as HTMLMediaElement
    attributes.rr_mediaState = mediaElement.paused ? 'paused' : 'played'
  }

  /**
   * Serialize the scroll state for each element
   */
  if (element.scrollLeft) {
    attributes.rr_scrollLeft = Math.round(element.scrollLeft)
  }
  if (element.scrollTop) {
    attributes.rr_scrollTop = Math.round(element.scrollTop)
  }

  let childNodes: SerializedNodeWithId[] = []
  if (element.childNodes.length) {
    // We should not create a new object systematically as it could impact performances. Try to reuse
    // the same object as much as possible, and clone it only if we need to.
    const childNodesSerializationOptions = { ...options } // TODO: TODO:
    childNodesSerializationOptions.parentNodePrivacyLevel = internalPrivacyLevel
    if (tagName === 'head') {
      childNodesSerializationOptions.ignoreWhiteSpace = true
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

/**
 * TODO: Deprecate this check and move to replay side
 * TODO: Preserve CSS element order, and record the presence of the tag, just don't render
 * We don't need this logic on the recorder side.
 * For security related meta's, customer can mask themmanually given they
 * are easy to identify in the HEAD tag.
 */
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

/**
 * Text Nodes are dependant on Element nodes
 * Privacy levels are set on elements so we check the parentElement of a text node
 * for privacy level.
 */
function serializeTextNode(textNode: Text, options: SerializeOptions): TextNode | undefined {
  // The parent node may not be a html element which has a tagName attribute.
  // So just let it be undefined which is ok in this use case.
  const parentTagName = textNode.parentElement?.tagName
  const textContent = getTextContent(textNode, options.ignoreWhiteSpace || false)
  if (!textContent) {
    return
  }
  return {
    type: NodeType.Text,
    textContent,
    isStyle: parentTagName === 'STYLE' ? true : undefined,
  }
}

function serializeCDataNode(): CDataNode {
  return {
    type: NodeType.CDATA,
    textContent: '',
  }
}

export function serializeChildNodes(node: Node, options: SerializeOptions): SerializedNodeWithId[] {
  const nodePrivacyLevel = options.parentNodePrivacyLevel
    ? remapInternalPrivacyLevels(node, options.parentNodePrivacyLevel)
    : getNodePrivacyLevel(node)
  const result: SerializedNodeWithId[] = []
  let shuffleElements = false

  if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
    return result
  }

  // To enhance privacy, we shuffle the child order for dropdowns. We don't want to shuffle text
  // nodes around though, which should not exist alone within DATALIST/SELECT/OPTGROUP elements
  if (nodePrivacyLevel === NodePrivacyLevel.MASK && node.nodeType === Node.ELEMENT_NODE) {
    const tagName = (node as HTMLElement).tagName
    if (tagName === 'DATALIST' || tagName === 'SELECT' || tagName === 'OPTGROUP') {
      shuffleElements = true
    }
  }

  const childNodeElements = shuffleElements ? (node as HTMLElement).children : node.childNodes

  forEach(childNodeElements, (childNode) => {
    const serializedChildNode = serializeNodeWithId(childNode, options)
    if (serializedChildNode) {
      result.push(serializedChildNode)
    }
  })

  if (shuffleElements) {
    shuffle<SerializedNodeWithId>(result)
  }

  return result
}

let _nextId = 1
function generateNextId(): number {
  return _nextId++
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
