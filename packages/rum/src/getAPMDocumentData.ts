import { findCommaSeparatedValue } from '@datadog/browser-core'

interface APMDocumentData {
  traceId: string
  traceTime: number
}

export function getAPMDocumentData(document: Document): APMDocumentData | undefined {
  return getAPMDocumentDataFromMeta(document) || getAPMDocumentDataFromComment(document)
}

export function getAPMDocumentDataFromMeta(document: Document): APMDocumentData | undefined {
  const traceIdMeta = document.querySelector<HTMLMetaElement>('meta[name=dd-trace-id]')
  const traceTimeMeta = document.querySelector<HTMLMetaElement>('meta[name=dd-trace-time]')
  return createAPMDocumentData(traceIdMeta && traceIdMeta.content, traceTimeMeta && traceTimeMeta.content)
}

export function getAPMDocumentDataFromComment(document: Document): APMDocumentData | undefined {
  const comment = findAPMComment(document)
  if (!comment) {
    return undefined
  }
  return createAPMDocumentData(
    findCommaSeparatedValue(comment, 'trace-id'),
    findCommaSeparatedValue(comment, 'trace-time')
  )
}

export function createAPMDocumentData(
  traceId: string | undefined | null,
  rawTraceTime: string | undefined | null
): APMDocumentData | undefined {
  const traceTime = rawTraceTime && Number(rawTraceTime)
  if (!traceId || !traceTime) {
    return undefined
  }

  return {
    traceId,
    traceTime,
  }
}

export function findAPMComment(document: Document): string | undefined {
  // 1. Try to find the comment as a direct child of the document
  // Note: TSLint advises to use a 'for of', but TS doesn't allow to use 'for of' if the iterated
  // value is not an array or string (here, a NodeList).
  // tslint:disable-next-line: prefer-for-of
  for (let i = 0; i < document.childNodes.length; i += 1) {
    const comment = getAPMCommentFromNode(document.childNodes[i])
    if (comment) {
      return comment
    }
  }

  // 2. If the comment is placed after the </html> tag, but have some space or new lines before or
  // after, the DOM parser will lift it (and the surrounding text) at the end of the <body> tag.
  // Try to look for the comment at the end of the <body> by by iterating over its child nodes in
  // reverse order, stoping if we come accross a non-text node.
  if (document.body) {
    for (let i = document.body.childNodes.length - 1; i >= 0; i -= 1) {
      const node = document.body.childNodes[i]
      const comment = getAPMCommentFromNode(node)
      if (comment) {
        return comment
      }
      if (!isTextNode(node)) {
        break
      }
    }
  }
}

function getAPMCommentFromNode(node: Node | null) {
  if (node && isCommentNode(node)) {
    const match = node.data.match(/^\s*DATADOG;(.*?)\s*$/)
    if (match) {
      return match[1]
    }
  }
}

function isCommentNode(node: Node): node is Comment {
  return node.nodeName === '#comment'
}

function isTextNode(node: Node): node is Text {
  return node.nodeName === '#text'
}
