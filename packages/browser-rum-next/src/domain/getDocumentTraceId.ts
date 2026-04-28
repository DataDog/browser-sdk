const OUTDATED_THRESHOLD = 2 * 60 * 1000 // 2 minutes

function getDocumentTraceId(doc: Document): string | undefined {
  const data = getFromMeta(doc) || getFromComment(doc)
  if (!data) return undefined
  if (data.traceTime <= Date.now() - OUTDATED_THRESHOLD) return undefined
  return data.traceId
}

function getFromMeta(doc: Document): { traceId: string; traceTime: number } | undefined {
  const traceId = doc.querySelector('meta[name="dd-trace-id"]')?.getAttribute('content')
  const traceTime = doc.querySelector('meta[name="dd-trace-time"]')?.getAttribute('content')
  if (!traceId || !traceTime) return undefined
  return { traceId, traceTime: Number(traceTime) }
}

function getFromComment(doc: Document): { traceId: string; traceTime: number } | undefined {
  const root = doc.documentElement
  for (let i = 0; i < root.childNodes.length; i++) {
    const node = root.childNodes[i]
    if (node.nodeType === Node.COMMENT_NODE) {
      const match = node.textContent?.match(/DATADOG;trace-id=(\d+),trace-time=(\d+)/)
      if (match) return { traceId: match[1], traceTime: Number(match[2]) }
    }
  }
  return undefined
}

export { getDocumentTraceId }
