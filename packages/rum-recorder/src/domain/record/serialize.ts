import { display } from '@datadog/browser-core'
import { PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_HIDDEN } from '../../constants'
import { nodeShouldBeHidden } from './privacy'
import { SerializedNode, SerializedNodeWithId, NodeType, Attributes, IdNodeMap } from './types'
import {
  makeStylesheetUrlsAbsolute,
  getSerializedNodeId,
  hasSerializedNode,
  IGNORED_NODE_ID,
  setSerializedNode,
  transformAttribute,
} from './serializationUtils'

interface SerializeOptions {
  document: Document
  map: IdNodeMap
  ignoreWhiteSpace?: boolean
}

export function serializeDocument(document: Document): SerializedNodeWithId {
  // We are sure that Documents are never ignored, so this function never returns null
  return serializeNodeWithId(document, {
    document,
    map: {},
  })!
}

export function serializeNodeWithId(n: Node, options: SerializeOptions): SerializedNodeWithId | null {
  const serializedNode = serializeNode(n, options)
  if (!serializedNode) {
    // TODO: dev only
    display.warn(n, 'not serialized')
    return null
  }

  let id
  // Try to reuse the previous id
  if (hasSerializedNode(n)) {
    id = getSerializedNodeId(n)
  } else if (
    nodeShouldBeIgnored(serializedNode) ||
    (options.ignoreWhiteSpace &&
      serializedNode.type === NodeType.Text &&
      !serializedNode.isStyle &&
      !serializedNode.textContent.replace(/^\s+|\s+$/gm, '').length)
  ) {
    id = IGNORED_NODE_ID
  } else {
    id = generateNextId()
  }
  const serializedNodeWithId = serializedNode as SerializedNodeWithId
  serializedNodeWithId.id = id
  setSerializedNode(n, serializedNodeWithId)
  if (id === IGNORED_NODE_ID) {
    return null
  }
  options.map[id] = true
  let recordChild = true
  if (serializedNode.type === NodeType.Element) {
    recordChild = !serializedNode.shouldBeHidden
    // this property was not needed in replay side
    delete serializedNode.shouldBeHidden
  }
  if ((serializedNode.type === NodeType.Document || serializedNode.type === NodeType.Element) && recordChild) {
    let childrenOptions = options
    if (
      serializedNode.type === NodeType.Element &&
      serializedNode.tagName === 'head'
      // would impede performance: || getComputedStyle(n)['white-space'] === 'normal'
    ) {
      childrenOptions = { ...childrenOptions, ignoreWhiteSpace: true }
    }
    for (const childN of Array.from(n.childNodes)) {
      const serializedChildNode = serializeNodeWithId(childN, childrenOptions)
      if (serializedChildNode) {
        serializedNode.childNodes.push(serializedChildNode)
      }
    }
  }
  return serializedNodeWithId
}

function serializeNode(n: Node, options: SerializeOptions): SerializedNode | false {
  switch (n.nodeType) {
    case n.DOCUMENT_NODE:
      return {
        type: NodeType.Document,
        childNodes: [],
      }
    case n.DOCUMENT_TYPE_NODE:
      return {
        type: NodeType.DocumentType,
        name: (n as DocumentType).name,
        publicId: (n as DocumentType).publicId,
        systemId: (n as DocumentType).systemId,
      }
    case n.ELEMENT_NODE:
      const shouldBeHidden = nodeShouldBeHidden(n)
      const tagName = getValidTagName((n as HTMLElement).tagName)
      let attributes: Attributes = {}
      for (const { name, value } of Array.from((n as HTMLElement).attributes)) {
        attributes[name] = transformAttribute(options.document, name, value)
      }
      // remote css
      if (tagName === 'link') {
        const stylesheet = Array.from(options.document.styleSheets).find((s) => s.href === (n as HTMLLinkElement).href)
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
        (n as HTMLStyleElement).sheet &&
        // TODO: Currently we only try to get dynamic stylesheet when it is an empty style element
        !((n as HTMLElement).innerText || (n as HTMLElement).textContent || '').trim().length
      ) {
        const cssText = getCssRulesString((n as HTMLStyleElement).sheet as CSSStyleSheet)
        if (cssText) {
          attributes._cssText = makeStylesheetUrlsAbsolute(cssText, location.href)
        }
      }
      // form fields
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
        const value = (n as HTMLInputElement | HTMLTextAreaElement).value
        if (
          attributes.type !== 'radio' &&
          attributes.type !== 'checkbox' &&
          attributes.type !== 'submit' &&
          attributes.type !== 'button' &&
          value
        ) {
          attributes.value = value
        } else if ((n as HTMLInputElement).checked) {
          attributes.checked = (n as HTMLInputElement).checked
        }
      }
      if (tagName === 'option') {
        const selectValue = (n as HTMLOptionElement).parentElement
        if (attributes.value === (selectValue as HTMLSelectElement).value) {
          attributes.selected = (n as HTMLOptionElement).selected
        }
      }
      // media elements
      if (tagName === 'audio' || tagName === 'video') {
        attributes.rr_mediaState = (n as HTMLMediaElement).paused ? 'paused' : 'played'
      }
      // scroll
      if ((n as HTMLElement).scrollLeft) {
        attributes.rr_scrollLeft = (n as HTMLElement).scrollLeft
      }
      if ((n as HTMLElement).scrollTop) {
        attributes.rr_scrollTop = (n as HTMLElement).scrollTop
      }
      if (shouldBeHidden) {
        const { width, height } = (n as HTMLElement).getBoundingClientRect()
        attributes = {
          id: attributes.id,
          class: attributes.class,
          rr_width: `${width}px`,
          rr_height: `${height}px`,
          [PRIVACY_ATTR_NAME]: PRIVACY_ATTR_VALUE_HIDDEN,
        }
      }
      return {
        type: NodeType.Element,
        tagName,
        attributes,
        childNodes: [],
        isSVG: isSVGElement(n as Element) || undefined,
        shouldBeHidden,
      }
    case n.TEXT_NODE:
      // The parent node may not be a html element which has a tagName attribute.
      // So just let it be undefined which is ok in this use case.
      const parentTagName = n.parentNode && (n.parentNode as HTMLElement).tagName
      let textContent = (n as Text).textContent
      const isStyle = parentTagName === 'STYLE' ? true : undefined
      if (isStyle && textContent) {
        textContent = makeStylesheetUrlsAbsolute(textContent, location.href)
      }
      if (parentTagName === 'SCRIPT') {
        textContent = 'SCRIPT_PLACEHOLDER'
      }
      return {
        type: NodeType.Text,
        textContent: textContent || '',
        isStyle,
      }
    case n.CDATA_SECTION_NODE:
      return {
        type: NodeType.CDATA,
        textContent: '',
      }
    case n.COMMENT_NODE:
      return {
        type: NodeType.Comment,
        textContent: (n as Comment).textContent || '',
      }
    default:
      return false
  }
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

function lowerIfExists(maybeAttr: string | number | boolean): string {
  if (maybeAttr === undefined) {
    return ''
  }
  return (maybeAttr as string).toLowerCase()
}

function nodeShouldBeIgnored(sn: SerializedNode): boolean {
  if (sn.type === NodeType.Comment) {
    // TODO: convert IE conditional comments to real nodes
    return true
  }

  if (sn.type === NodeType.Element) {
    if (sn.tagName === 'script') {
      return true
    }

    if (sn.tagName === 'link') {
      const relAttribute = lowerIfExists(sn.attributes.rel)
      return (
        // Scripts
        (relAttribute === 'preload' && sn.attributes.as === 'script') ||
        // Favicons
        relAttribute === 'shortcut icon' ||
        relAttribute === 'icon'
      )
    }

    if (sn.tagName === 'meta') {
      const nameAttribute = lowerIfExists(sn.attributes.name)
      const relAttribute = lowerIfExists(sn.attributes.rel)
      const propertyAttribute = lowerIfExists(sn.attributes.property)
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
        sn.attributes['http-equiv'] !== undefined ||
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
  }

  return false
}
