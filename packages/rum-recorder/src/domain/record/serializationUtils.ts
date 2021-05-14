import { buildUrl } from '@datadog/browser-core'
import { SerializedNodeWithId } from './types'

export const IGNORED_NODE_ID = -2

export interface NodeWithSerializedNode extends Node {
  __sn: SerializedNodeWithId
}

export function hasSerializedNode(n: Node): n is NodeWithSerializedNode {
  return '__sn' in n
}

export function getSerializedNodeId(n: NodeWithSerializedNode): number
export function getSerializedNodeId(n: Node): number | undefined
export function getSerializedNodeId(n: Node) {
  return hasSerializedNode(n) ? n.__sn.id : undefined
}

export function setSerializedNode(n: Node, serializeNode: SerializedNodeWithId) {
  ;(n as Partial<NodeWithSerializedNode>).__sn = serializeNode
}

export function nodeIsIgnored(n: NodeWithSerializedNode): boolean {
  return getSerializedNodeId(n) === IGNORED_NODE_ID
}

export function nodeOrAncestorsIsIgnored(n: NodeWithSerializedNode) {
  let current: NodeWithSerializedNode | null = n
  while (current) {
    if (nodeIsIgnored(current)) {
      return true
    }
    // Since we serialize the document from the root, and any new node is only serialized if they
    // are added in a serialized node, we are guaranteed to have a serialized parent node here.
    current = current.parentNode as NodeWithSerializedNode | null
  }
  return false
}

export function transformAttribute(doc: Document, name: string, value: string): string {
  if (value) {
    if (name === 'src' || name === 'href') {
      return makeUrlAbsolute(value, doc.location.href)
    }
    if (name === 'srcset') {
      return makeSrcsetUrlsAbsolute(value, doc.location.href)
    }
    if (name === 'style') {
      return makeStylesheetUrlsAbsolute(value, doc.location.href)
    }
  }
  return value
}

const URL_IN_CSS_REF = /url\((?:(')([^']*)'|(")([^"]*)"|([^)]*))\)/gm
const ABSOLUTE_URL = /^[A-Za-z]:|^\/\//
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
