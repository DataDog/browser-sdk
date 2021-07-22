import { buildUrl } from '@datadog/browser-core'
import { NodePrivacyLevel, CENSORED_STRING_MARK } from '../../constants'
import { getRumRecorderConfig } from '../../boot/startRecording'
import { getNodePrivacyLevel } from './privacy'
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
    return makeUrlAbsolute(value, doc.location?.href)
  }
  if (name === 'srcset') {
    return makeSrcsetUrlsAbsolute(value, doc.location?.href)
  }
  if (name === 'style') {
    return makeStylesheetUrlsAbsolute(value, doc.location?.href)
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
  try {
    return buildUrl(url.trim(), baseUrl).href
  } catch (_) {
    return url
  }
}

// Helper Func for mutation observer
export function getElementInputValue(element: Element) {
  const nodePrivacyLevel = getNodePrivacyLevel(element)
  const tagName = element.localName
  if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN || nodePrivacyLevel === NodePrivacyLevel.MASK) {
    return CENSORED_STRING_MARK
  }
  const inputElement = element as HTMLInputElement
  if (tagName === 'option' || tagName === 'select') {
    const optionElement = element as HTMLOptionElement
    // Matching empty strings is not considered selected.
    if (optionElement?.value) {
      return optionElement.value
    }
  }
  // Textarea, Input
  return inputElement.value
}

export function isFlagEnabled(feature: string): boolean {
  const configuration = getRumRecorderConfig()
  if (!configuration) {
    return false
  }
  return configuration.isEnabled(feature)
}
