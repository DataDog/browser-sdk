import { buildUrl } from '@datadog/browser-core'
import { InputPrivacyMode } from '../../constants'
import { getNodeInputPrivacyMode, getNodeOrAncestorsInputPrivacyMode } from './privacy'
import { SerializedNodeWithId } from './types'

export interface NodeWithSerializedNode extends Node {
  __sn: SerializedNodeWithId
}

export function hasSerializedNode(node: Node): node is NodeWithSerializedNode {
  return '__sn' in node
}

export function nodeAndAncestorsHaveSerializedNode(node: Node): node is NodeWithSerializedNode {
  let current: Node | null = node
  while (current) {
    if (!hasSerializedNode(current)) {
      return false
    }
    current = current.parentNode
  }
  return true
}

export function getSerializedNodeId(node: NodeWithSerializedNode): number
export function getSerializedNodeId(node: Node): number | undefined
export function getSerializedNodeId(node: Node) {
  return hasSerializedNode(node) ? node.__sn.id : undefined
}

export function setSerializedNode(node: Node, serializeNode: SerializedNodeWithId) {
  ;(node as Partial<NodeWithSerializedNode>).__sn = serializeNode
}

export function transformAttribute(doc: Document, name: string, value: string): string {
  if (!value) {
    return value
  }
  if (name === 'src' || name === 'href') {
    return makeUrlAbsolute(value, doc.location.href)
  }
  if (name === 'srcset') {
    return makeSrcsetUrlsAbsolute(value, doc.location.href)
  }
  if (name === 'style') {
    return makeStylesheetUrlsAbsolute(value, doc.location.href)
  }
  return value
}

const URL_IN_CSS_REF = /url\((?:(')([^']*)'|(")([^"]*)"|([^)]*))\)/gm
const ABSOLUTE_URL = /^[A-Za-z]+:|^\/\//
const DATA_URI = /^data:.*,/i
export function makeStylesheetUrlsAbsolute(cssText: string, baseUrl: string): string {
  return cssText.replace(
    URL_IN_CSS_REF,
    (origin: string, quote1: string, path1: string, quote2: string, path2: string, path3: string) => {
      const filePath = path1 || path2 || path3
      if (!filePath || ABSOLUTE_URL.test(filePath) || DATA_URI.test(filePath)) {
        return origin
      }
      const maybeQuote = quote1 || quote2 || ''
      return `url(${maybeQuote}${makeUrlAbsolute(filePath, baseUrl)}${maybeQuote})`
    }
  )
}

const SRCSET_URLS = /(^\s*|,\s*)([^\s,]+)/g
export function makeSrcsetUrlsAbsolute(attributeValue: string, baseUrl: string) {
  return attributeValue.replace(
    SRCSET_URLS,
    (_, prefix: string, url: string) => `${prefix}${makeUrlAbsolute(url, baseUrl)}`
  )
}

export function makeUrlAbsolute(url: string, baseUrl: string): string {
  return buildUrl(url.trim(), baseUrl).href
}

/**
 * Get the element "value" to be serialized as an attribute or an input update record. It respects
 * the input privacy mode of the element. An 'ancestorInputPrivacyMode' can be provided (if known)
 * to avoid iterating over the element ancestors when looking for the input privacy mode.
 */
export function getElementInputValue(element: Element, ancestorInputPrivacyMode?: InputPrivacyMode) {
  const tagName = element.tagName
  if (tagName === 'OPTION' || tagName === 'SELECT') {
    // Always use the option and select value, as they are useful to display the currently selected
    // option during replay. They can still be hidden via the "hidden" privacy attribute or class
    // name.
    return (element as HTMLOptionElement | HTMLSelectElement).value
  }

  if (tagName !== 'INPUT' && tagName !== 'TEXTAREA') {
    return
  }

  const value = (element as HTMLInputElement | HTMLTextAreaElement).value
  const type = (element as HTMLInputElement | HTMLTextAreaElement).type

  if (type === 'button' || type === 'submit' || type === 'reset') {
    // Always use button-like element values, as they are used during replay to display their label.
    // They can still be hidden via the "hidden" privacy attribute or class name.
    return value
  }

  const inputPrivacyMode = ancestorInputPrivacyMode
    ? getNodeInputPrivacyMode(element) || ancestorInputPrivacyMode
    : getNodeOrAncestorsInputPrivacyMode(element)

  if (
    inputPrivacyMode === InputPrivacyMode.IGNORED ||
    // Never use the radio and checkbox value, as they are not useful during replay.
    type === 'radio' ||
    type === 'checkbox'
  ) {
    return
  }

  return inputPrivacyMode === InputPrivacyMode.MASKED ? maskValue(value) : value
}

export function maskValue(value: string) {
  return value.replace(/./g, () => '*')
}
