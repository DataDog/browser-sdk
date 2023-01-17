import { buildUrl } from '@datadog/browser-core'
import { getParentNode, isNodeShadowRoot } from '@datadog/browser-rum-core'
import type { NodePrivacyLevel } from '../../constants'
import { CENSORED_STRING_MARK } from '../../constants'
import type { StyleSheet } from '../../types'
import { shouldMaskNode } from './privacy'

export type NodeWithSerializedNode = Node & { s: 'Node with serialized node' }

const serializedNodeIds = new WeakMap<Node, number>()

export function hasSerializedNode(node: Node): node is NodeWithSerializedNode {
  return serializedNodeIds.has(node)
}

export function nodeAndAncestorsHaveSerializedNode(node: Node): node is NodeWithSerializedNode {
  let current: Node | null = node
  while (current) {
    if (!hasSerializedNode(current) && !isNodeShadowRoot(current)) {
      return false
    }
    current = getParentNode(current)
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

export const URL_IN_CSS_REF = /url\((?:(')([^']*)'|(")([^"]*)"|([^)]*))\)/gm
export const ABSOLUTE_URL = /^[A-Za-z]+:|^\/\//
export const DATA_URI = /^data:.*,/i

export function switchToAbsoluteUrl(cssText: string, cssHref: string | null): string {
  return cssText.replace(
    URL_IN_CSS_REF,
    (
      matchingSubstring: string,
      singleQuote: string | undefined,
      urlWrappedInSingleQuotes: string | undefined,
      doubleQuote: string | undefined,
      urlWrappedInDoubleQuotes: string | undefined,
      urlNotWrappedInQuotes: string | undefined
    ) => {
      const url = urlWrappedInSingleQuotes || urlWrappedInDoubleQuotes || urlNotWrappedInQuotes

      if (!cssHref || !url || ABSOLUTE_URL.test(url) || DATA_URI.test(url)) {
        return matchingSubstring
      }

      const quote = singleQuote || doubleQuote || ''
      return `url(${quote}${makeUrlAbsolute(url, cssHref)}${quote})`
    }
  )
}

export function makeUrlAbsolute(url: string, baseUrl: string): string {
  try {
    return buildUrl(url, baseUrl).href
  } catch (_) {
    return url
  }
}

export function serializeStyleSheets(cssStyleSheets: CSSStyleSheet[] | undefined): StyleSheet[] | undefined {
  if (cssStyleSheets === undefined || cssStyleSheets.length === 0) {
    return undefined
  }
  return cssStyleSheets.map((cssStyleSheet) => {
    const rules = cssStyleSheet.cssRules || cssStyleSheet.rules
    const cssRules = Array.from(rules, (cssRule) => cssRule.cssText)

    const styleSheet: StyleSheet = {
      cssRules,
      disabled: cssStyleSheet.disabled || undefined,
      media: cssStyleSheet.media.length > 0 ? Array.from(cssStyleSheet.media) : undefined,
    }
    return styleSheet
  })
}
