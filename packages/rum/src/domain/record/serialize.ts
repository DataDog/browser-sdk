import { assign } from '@datadog/browser-core'
import {
  NodePrivacyLevel,
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_HIDDEN,
  CENSORED_STRING_MARK,
  CENSORED_IMG_MARK,
} from '../../constants'
import {
  getTextContent,
  shouldMaskNode,
  reducePrivacyLevel,
  getNodeSelfPrivacyLevel,
  MAX_ATTRIBUTE_VALUE_CHAR_LENGTH,
} from './privacy'
import type {
  SerializedNode,
  SerializedNodeWithId,
  DocumentNode,
  DocumentTypeNode,
  ElementNode,
  TextNode,
  CDataNode,
} from './types'
import { NodeType } from './types'
import { getSerializedNodeId, setSerializedNodeId, getElementInputValue } from './serializationUtils'
import { forEach } from './utils'

// Those values are the only one that can be used when inheriting privacy levels from parent to
// children during serialization, since HIDDEN and IGNORE shouldn't serialize their children. This
// ensures that no children are serialized when they shouldn't.
type ParentNodePrivacyLevel =
  | typeof NodePrivacyLevel.ALLOW
  | typeof NodePrivacyLevel.MASK
  | typeof NodePrivacyLevel.MASK_USER_INPUT

export interface SerializeOptions {
  document: Document
  serializedNodeIds?: Set<number>
  ignoreWhiteSpace?: boolean
  parentNodePrivacyLevel: ParentNodePrivacyLevel
}

export function serializeDocument(
  document: Document,
  defaultPrivacyLevel: ParentNodePrivacyLevel
): SerializedNodeWithId {
  // We are sure that Documents are never ignored, so this function never returns null
  return serializeNodeWithId(document, {
    document,
    parentNodePrivacyLevel: defaultPrivacyLevel,
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
  setSerializedNodeId(node, id)
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

  const attributes = getAttributesForPrivacyLevel(element, nodePrivacyLevel)

  let childNodes: SerializedNodeWithId[] = []
  if (element.childNodes.length) {
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

/**
 * Text Nodes are dependant on Element nodes
 * Privacy levels are set on elements so we check the parentElement of a text node
 * for privacy level.
 */
function serializeTextNode(textNode: Text, options: SerializeOptions): TextNode | undefined {
  // The parent node may not be a html element which has a tagName attribute.
  // So just let it be undefined which is ok in this use case.
  const parentTagName = textNode.parentElement?.tagName
  const textContent = getTextContent(textNode, options.ignoreWhiteSpace || false, options.parentNodePrivacyLevel)
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
  const result: SerializedNodeWithId[] = []

  forEach(node.childNodes, (childNode) => {
    const serializedChildNode = serializeNodeWithId(childNode, options)
    if (serializedChildNode) {
      result.push(serializedChildNode)
    }
  })

  return result
}

export function serializeAttribute(
  element: Element,
  nodePrivacyLevel: NodePrivacyLevel,
  attributeName: string
): string | number | boolean | null {
  if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
    // dup condition for direct access case
    return null
  }
  const attributeValue = element.getAttribute(attributeName)
  if (nodePrivacyLevel === NodePrivacyLevel.MASK) {
    const tagName = element.tagName

    switch (attributeName) {
      // Mask Attribute text content
      case 'title':
      case 'alt':
        return CENSORED_STRING_MARK
    }
    // mask image URLs
    if (tagName === 'IMG' || tagName === 'SOURCE') {
      if (attributeName === 'src' || attributeName === 'srcset') {
        return CENSORED_IMG_MARK
      }
    }
    // mask <a> URLs
    if (tagName === 'A' && attributeName === 'href') {
      return CENSORED_STRING_MARK
    }
    // mask data-* attributes
    if (attributeValue && attributeName.indexOf('data-') === 0 && attributeName !== PRIVACY_ATTR_NAME) {
      // Exception: it's safe to reveal the `${PRIVACY_ATTR_NAME}` attr
      return CENSORED_STRING_MARK
    }
  }

  if (!attributeValue || typeof attributeValue !== 'string') {
    return attributeValue
  }

  // Minimum Fix for customer.
  if (attributeValue.length > MAX_ATTRIBUTE_VALUE_CHAR_LENGTH && attributeValue.slice(0, 5) === 'data:') {
    return 'data:truncated'
  }

  return attributeValue
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

function getAttributesForPrivacyLevel(
  element: Element,
  nodePrivacyLevel: NodePrivacyLevel
): Record<string, string | number | boolean> {
  if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
    return {}
  }
  const safeAttrs: Record<string, string | number | boolean> = {}
  const tagName = getValidTagName(element.tagName)
  const doc = element.ownerDocument

  type HtmlAttribute = { name: string; value: string }
  for (let i = 0; i < element.attributes.length; i += 1) {
    const attribute = element.attributes.item(i) as HtmlAttribute
    const attributeName = attribute.name
    const attributeValue = serializeAttribute(element, nodePrivacyLevel, attributeName)
    if (attributeValue !== null) {
      safeAttrs[attributeName] = attributeValue
    }
  }

  if (
    (element as HTMLInputElement).value &&
    (tagName === 'textarea' || tagName === 'select' || tagName === 'option' || tagName === 'input')
  ) {
    const formValue = getElementInputValue(element, nodePrivacyLevel)
    if (formValue !== undefined) {
      safeAttrs.value = formValue
    }
  }

  /**
   * <Option> can be selected, which occurs if its `value` matches ancestor `<Select>.value`
   */
  if (tagName === 'option' && nodePrivacyLevel === NodePrivacyLevel.ALLOW) {
    // For privacy=`MASK`, all the values would be the same, so skip.
    const optionElement = element as HTMLOptionElement
    if (optionElement.selected) {
      safeAttrs.selected = optionElement.selected
    }
  }

  // remote css
  if (tagName === 'link') {
    const stylesheet = Array.from(doc.styleSheets).find((s) => s.href === (element as HTMLLinkElement).href)
    const cssText = getCssRulesString(stylesheet as CSSStyleSheet)
    if (cssText && stylesheet) {
      delete safeAttrs.rel
      delete safeAttrs.href
      safeAttrs._cssText = cssText
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
      safeAttrs._cssText = cssText
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
  const inputElement = element as HTMLInputElement
  if (tagName === 'input' && (inputElement.type === 'radio' || inputElement.type === 'checkbox')) {
    if (nodePrivacyLevel === NodePrivacyLevel.ALLOW) {
      safeAttrs.checked = !!inputElement.checked
    } else if (shouldMaskNode(inputElement, nodePrivacyLevel)) {
      safeAttrs.checked = CENSORED_STRING_MARK
    }
  }

  /**
   * Serialize the media playback state
   */
  if (tagName === 'audio' || tagName === 'video') {
    const mediaElement = element as HTMLMediaElement
    safeAttrs.rr_mediaState = mediaElement.paused ? 'paused' : 'played'
  }

  /**
   * Serialize the scroll state for each element
   */
  if (element.scrollLeft) {
    safeAttrs.rr_scrollLeft = Math.round(element.scrollLeft)
  }
  if (element.scrollTop) {
    safeAttrs.rr_scrollTop = Math.round(element.scrollTop)
  }

  return safeAttrs
}
