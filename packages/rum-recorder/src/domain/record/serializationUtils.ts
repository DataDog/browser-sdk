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
