import { buildUrl, isExperimentalFeatureEnabled } from '@datadog/browser-core'
import { CENSORED_STRING_MARK, NodePrivacyLevel } from '../../constants'
import { shouldMaskNode } from './privacy'

export type NodeWithSerializedNode = Node & { s: 'Node with serialized node' }

const serializedNodeIds = new WeakMap<Node, number>()

export function hasSerializedNode(node: Node): node is NodeWithSerializedNode {
  return serializedNodeIds.has(node)
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
  return serializedNodeIds.get(node)
}

export function setSerializedNodeId(node: Node, serializeNodeId: number) {
  serializedNodeIds.set(node, serializeNodeId)
}

const URL_IN_CSS_REF = /url\((?:(')([^']*)'|(")([^"]*)"|([^)]*))\)/gm
const ABSOLUTE_URL = /^[A-Za-z]+:|^\/\//
const DATA_URI = /^data:.*,/i
export function makeStylesheetUrlsAbsolute(cssText: string, baseUrl: string): string {
  if (isExperimentalFeatureEnabled('base-tag')) {
    return cssText
  }
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
  if (isExperimentalFeatureEnabled('base-tag')) {
    return attributeValue
  }
  return attributeValue.replace(
    SRCSET_URLS,
    (_, prefix: string, url: string) => `${prefix}${makeUrlAbsolute(url, baseUrl)}`
  )
}

export function makeUrlAbsolute(url: string, baseUrl: string): string {
  try {
    if (isExperimentalFeatureEnabled('base-tag')) {
      return url
    }
    return buildUrl(url.trim(), baseUrl).href
  } catch (_) {
    return url
  }
}

/**
 * Get the element "value" to be serialized as an attribute or an input update record. It respects
 * the input privacy mode of the element.
 * PERFROMANCE OPTIMIZATION: Assumes that privacy level `HIDDEN` is never encountered because of earlier checks.
 */
export function getElementInputValue(element: Element, nodePrivacyLevel: NodePrivacyLevel) {
  /*
   BROWSER SPEC NOTE: <input>, <select>
   For some <input> elements, the `value` is an exceptional property/attribute that has the
   value synced between el.value and el.getAttribute()
   input[type=button,checkbox,hidden,image,radio,reset,submit]
   */
  const tagName = element.tagName
  const value = (element as HTMLInputElement | HTMLTextAreaElement).value

  if (shouldMaskNode(element, nodePrivacyLevel)) {
    const type = (element as HTMLInputElement | HTMLTextAreaElement).type
    if (tagName === 'INPUT' && (type === 'button' || type === 'submit' || type === 'reset')) {
      // Overrule `MASK` privacy level for button-like element values, as they are used during replay
      // to display their label. They can still be hidden via the "hidden" privacy attribute or class name.
      return value
    } else if (!value || tagName === 'OPTION') {
      // <Option> value provides no benefit
      return
    }
    return CENSORED_STRING_MARK
  }

  if (tagName === 'OPTION' || tagName === 'SELECT') {
    return (element as HTMLOptionElement | HTMLSelectElement).value
  }

  if (tagName !== 'INPUT' && tagName !== 'TEXTAREA') {
    return
  }

  return value
}
