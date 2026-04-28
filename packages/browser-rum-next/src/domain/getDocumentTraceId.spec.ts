import { getDocumentTraceId } from './getDocumentTraceId'

describe('getDocumentTraceId', () => {
  it('extracts trace ID from meta tags', () => {
    const doc = document.implementation.createHTMLDocument()
    const meta1 = doc.createElement('meta')
    meta1.setAttribute('name', 'dd-trace-id')
    meta1.setAttribute('content', '123456789')
    const meta2 = doc.createElement('meta')
    meta2.setAttribute('name', 'dd-trace-time')
    meta2.setAttribute('content', String(Date.now()))
    doc.head.appendChild(meta1)
    doc.head.appendChild(meta2)

    expect(getDocumentTraceId(doc)).toBe('123456789')
  })

  it('extracts trace ID from HTML comments', () => {
    const doc = document.implementation.createHTMLDocument()
    const comment = doc.createComment(` DATADOG;trace-id=987654321,trace-time=${Date.now()} `)
    doc.documentElement.appendChild(comment)

    expect(getDocumentTraceId(doc)).toBe('987654321')
  })

  it('returns undefined when no trace data', () => {
    const doc = document.implementation.createHTMLDocument()
    expect(getDocumentTraceId(doc)).toBeUndefined()
  })

  it('returns undefined when trace is older than 2 minutes', () => {
    const doc = document.implementation.createHTMLDocument()
    const meta1 = doc.createElement('meta')
    meta1.setAttribute('name', 'dd-trace-id')
    meta1.setAttribute('content', '123')
    const meta2 = doc.createElement('meta')
    meta2.setAttribute('name', 'dd-trace-time')
    meta2.setAttribute('content', String(Date.now() - 3 * 60 * 1000)) // 3 minutes ago
    doc.head.appendChild(meta1)
    doc.head.appendChild(meta2)

    expect(getDocumentTraceId(doc)).toBeUndefined()
  })

  it('prefers meta tags over comments', () => {
    const doc = document.implementation.createHTMLDocument()
    const meta1 = doc.createElement('meta')
    meta1.setAttribute('name', 'dd-trace-id')
    meta1.setAttribute('content', '111')
    const meta2 = doc.createElement('meta')
    meta2.setAttribute('name', 'dd-trace-time')
    meta2.setAttribute('content', String(Date.now()))
    doc.head.appendChild(meta1)
    doc.head.appendChild(meta2)
    const comment = doc.createComment(` DATADOG;trace-id=222,trace-time=${Date.now()} `)
    doc.documentElement.appendChild(comment)

    expect(getDocumentTraceId(doc)).toBe('111')
  })
})
