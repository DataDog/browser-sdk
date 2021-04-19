/* eslint-disable no-underscore-dangle */
import { nodeShouldBeHidden } from '../privacy'
import { PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_HIDDEN } from '../../constants'
import { SerializedNode, SerializedNodeWithId, NodeType, Attributes, INode } from './types'
import { getSerializedNodeId, setSerializedNode } from './utils'

const tagNameRegex = /[^a-z1-6-_]/

export const IGNORED_NODE = -2

let nextId = 1
function genId(): number {
  return nextId++
}

export function cleanupSnapshot() {
  // allow a new recording to start numbering nodes from scratch
  nextId = 1
}

function getValidTagName(tagName: string): string {
  const processedTagName = tagName.toLowerCase().trim()

  if (tagNameRegex.test(processedTagName)) {
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

function extractOrigin(url: string): string {
  let origin
  if (url.indexOf('//') > -1) {
    origin = url.split('/').slice(0, 3).join('/')
  } else {
    origin = url.split('/')[0]
  }
  origin = origin.split('?')[0]
  return origin
}

const URL_IN_CSS_REF = /url\((?:(')([^']*)'|(")([^"]*)"|([^)]*))\)/gm
const RELATIVE_PATH = /^(?!www\.|(?:http|ftp)s?:\/\/|[A-Za-z]:\\|\/\/).*/
const DATA_URI = /^(data:)([^,]*),(.*)/i
export function absoluteToStylesheet(cssText: string | null, href: string): string {
  return (cssText || '').replace(
    URL_IN_CSS_REF,
    (origin: string, quote1: string, path1: string, quote2: string, path2: string, path3: string) => {
      const filePath = path1 || path2 || path3
      const maybeQuote = quote1 || quote2 || ''
      if (!filePath) {
        return origin
      }
      if (!RELATIVE_PATH.test(filePath)) {
        return `url(${maybeQuote}${filePath}${maybeQuote})`
      }
      if (DATA_URI.test(filePath)) {
        return `url(${maybeQuote}${filePath}${maybeQuote})`
      }
      if (filePath[0] === '/') {
        return `url(${maybeQuote}${extractOrigin(href)}${filePath}${maybeQuote})`
      }
      const stack = href.split('/')
      const parts = filePath.split('/')
      stack.pop()
      for (const part of parts) {
        if (part === '.') {
          continue
        } else if (part === '..') {
          stack.pop()
        } else {
          stack.push(part)
        }
      }
      return `url(${maybeQuote}${stack.join('/')}${maybeQuote})`
    }
  )
}

function getAbsoluteSrcsetString(doc: Document, attributeValue: string) {
  if (attributeValue.trim() === '') {
    return attributeValue
  }

  const srcsetValues = attributeValue.split(',')
  // srcset attributes is defined as such:
  // srcset = "url size,url1 size1"
  const resultingSrcsetString = srcsetValues
    .map((srcItem) => {
      // removing all but middle spaces
      const trimmedSrcItem = srcItem.replace(/^\s+/, '').replace(/\s+$/, '')
      const urlAndSize = trimmedSrcItem.split(' ')
      // this means we have both 0:url and 1:size
      if (urlAndSize.length === 2) {
        const absUrl = absoluteToDoc(doc, urlAndSize[0])
        return `${absUrl} ${urlAndSize[1]}`
      } else if (urlAndSize.length === 1) {
        const absUrl = absoluteToDoc(doc, urlAndSize[0])
        return `${absUrl}`
      }
      return ''
    })
    .join(', ')

  return resultingSrcsetString
}

export function absoluteToDoc(doc: Document, attributeValue: string): string {
  if (!attributeValue || attributeValue.trim() === '') {
    return attributeValue
  }
  const a: HTMLAnchorElement = doc.createElement('a')
  a.href = attributeValue
  return a.href
}

function isSVGElement(el: Element): boolean {
  return el.tagName === 'svg' || el instanceof SVGElement
}

export function transformAttribute(doc: Document, name: string, value: string): string {
  // relative path in attribute
  if (name === 'src' || (name === 'href' && value)) {
    return absoluteToDoc(doc, value)
  }
  if (name === 'srcset' && value) {
    return getAbsoluteSrcsetString(doc, value)
  }
  if (name === 'style' && value) {
    return absoluteToStylesheet(value, location.href)
  }
  return value
}

function serializeNode(
  n: Node,
  options: {
    doc: Document
  }
): SerializedNode | false {
  const { doc } = options
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
        attributes[name] = transformAttribute(doc, name, value)
      }
      // remote css
      if (tagName === 'link') {
        const stylesheet = Array.from(doc.styleSheets).find((s) => s.href === (n as HTMLLinkElement).href)
        const cssText = getCssRulesString(stylesheet as CSSStyleSheet)
        if (cssText) {
          delete attributes.rel
          delete attributes.href
          attributes._cssText = absoluteToStylesheet(cssText, stylesheet!.href!)
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
          attributes._cssText = absoluteToStylesheet(cssText, location.href)
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
        textContent = absoluteToStylesheet(textContent, location.href)
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

function lowerIfExists(maybeAttr: string | number | boolean): string {
  if (maybeAttr === undefined) {
    return ''
  }
  return (maybeAttr as string).toLowerCase()
}

function isNodeIgnored(sn: SerializedNode): boolean {
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

export function serializeNodeWithId(
  n: Node | INode,
  options: {
    doc: Document
    skipChild: boolean
    preserveWhiteSpace?: boolean
  }
): SerializedNodeWithId | null {
  const { doc, skipChild = false } = options
  let { preserveWhiteSpace = true } = options
  const _serializedNode = serializeNode(n, {
    doc,
  })
  if (!_serializedNode) {
    // TODO: dev only
    console.warn(n, 'not serialized')
    return null
  }

  // Try to reuse the previous id
  let id = getSerializedNodeId(n)
  if (id === -1) {
    if (
      isNodeIgnored(_serializedNode) ||
      (!preserveWhiteSpace &&
        _serializedNode.type === NodeType.Text &&
        !_serializedNode.isStyle &&
        !_serializedNode.textContent.replace(/^\s+|\s+$/gm, '').length)
    ) {
      id = IGNORED_NODE
    } else {
      id = genId()
    }
  }
  const serializedNode = Object.assign(_serializedNode, { id })
  setSerializedNode(n, serializedNode)
  if (id === IGNORED_NODE) {
    return null
  }
  let recordChild = !skipChild
  if (serializedNode.type === NodeType.Element) {
    recordChild = recordChild && !serializedNode.shouldBeHidden
    // this property was not needed in replay side
    delete serializedNode.shouldBeHidden
  }
  if ((serializedNode.type === NodeType.Document || serializedNode.type === NodeType.Element) && recordChild) {
    if (
      _serializedNode.type === NodeType.Element &&
      _serializedNode.tagName === 'head'
      // would impede performance: || getComputedStyle(n)['white-space'] === 'normal'
    ) {
      preserveWhiteSpace = false
    }
    for (const childN of Array.from(n.childNodes)) {
      const serializedChildNode = serializeNodeWithId(childN, {
        doc,
        skipChild,
        preserveWhiteSpace,
      })
      if (serializedChildNode) {
        serializedNode.childNodes.push(serializedChildNode)
      }
    }
  }
  return serializedNode
}

export function snapshot(n: Document): SerializedNodeWithId | null {
  return serializeNodeWithId(n, {
    doc: n,
    skipChild: false,
  })
}
