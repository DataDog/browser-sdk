import {
  createAPMDocumentData,
  findAPMComment,
  getAPMDocumentData,
  getAPMDocumentDataFromMeta,
} from '../src/getAPMDocumentData'

const HTML_DOCTYPE = '\n<!DOCTYPE html>\n'
const HTML_CONTENT = '\n<html><head></head><body></body></html>\n'

describe('getAPMDocumentData', () => {
  it('uses the meta strategy in priority', () => {
    expect(
      getAPMDocumentData(
        createDocument(
          `<!-- DATADOG;trace-id=comment;trace-time=123 -->
          ${HTML_DOCTYPE}
          <html>
            <head>
              <meta name="dd-trace-id" content="meta" />
              <meta name="dd-trace-time" content="456" />
            </head>
            <body>
            </body>
          </html>`
        )
      )
    ).toEqual({ traceId: 'meta', traceTime: 456 })
  })

  it('returns undefined if nothing is present', () => {
    expect(getAPMDocumentData(createDocument(HTML_DOCTYPE + HTML_CONTENT))).toEqual(undefined)
  })
})

describe('getAPMDocumentDataFromMeta', () => {
  it('gets data from meta', () => {
    expect(
      getAPMDocumentDataFromMeta(
        createDocument(
          `${HTML_DOCTYPE}
          <html>
            <head>
              <meta name="dd-trace-id" content="123" />
              <meta name="dd-trace-time" content="456" />
            </head>
            <body>
            </body>
          </html>`
        )
      )
    ).toEqual({ traceId: '123', traceTime: 456 })
  })

  it('returns undefined if a meta is missing', () => {
    expect(
      getAPMDocumentDataFromMeta(
        createDocument(
          `${HTML_DOCTYPE}
          <html>
            <head>
              <meta name="dd-trace-id" content="123" />
            </head>
            <body>
            </body>
          </html>`
        )
      )
    ).toEqual(undefined)
  })
})

describe('findAPMComment', () => {
  const DATADOG_COMMENT = '\n<!-- DATADOG;foo=bar -->\n'

  it('returns undefined if no comment is present', () => {
    expect(findAPMComment(createDocument(HTML_DOCTYPE + HTML_CONTENT))).toBe(undefined)
  })

  it('returns undefined if no body is present', () => {
    expect(findAPMComment(createDocument(`${HTML_DOCTYPE}<html></html>`))).toBe(undefined)
  })

  it('finds a comment before the doctype', () => {
    expect(findAPMComment(createDocument(DATADOG_COMMENT + HTML_DOCTYPE + HTML_CONTENT))).toBe('foo=bar')
  })

  it('finds a comment before the HTML content', () => {
    expect(findAPMComment(createDocument(HTML_DOCTYPE + DATADOG_COMMENT + HTML_CONTENT))).toBe('foo=bar')
  })

  it('finds a comment after the HTML content', () => {
    expect(findAPMComment(createDocument(HTML_DOCTYPE + HTML_CONTENT + DATADOG_COMMENT))).toBe('foo=bar')
  })

  it('finds a comment at the end of the body', () => {
    expect(findAPMComment(createDocument(`${HTML_DOCTYPE}<html><body>${DATADOG_COMMENT}</body></html>`))).toBe(
      'foo=bar'
    )
  })

  it("doesn't match comments without the DATADOG; prefix", () => {
    expect(findAPMComment(createDocument(`${HTML_DOCTYPE}${HTML_CONTENT}<!-- foo=bar -->`))).toBe(undefined)
  })

  it("doesn't look for comments nested below the body", () => {
    expect(
      findAPMComment(createDocument(`${HTML_DOCTYPE}<html><body><div>${DATADOG_COMMENT}</div></body></html>`))
    ).toBe(undefined)
  })

  it('finds a comment surrounded by newlines', () => {
    expect(findAPMComment(createDocument(`<!--\nDATADOG;foo=bar\n-->${HTML_DOCTYPE}${HTML_CONTENT}`))).toBe('foo=bar')
  })
})

describe('createAPMDocumentData', () => {
  it('parses an APM comment', () => {
    expect(createAPMDocumentData('123', '456')).toEqual({
      traceId: '123',
      traceTime: 456,
    })
  })

  it('returns undefined if the time is not a number', () => {
    expect(createAPMDocumentData('123', '4x6')).toBe(undefined)
  })

  it('returns undefined if the time is missing', () => {
    expect(createAPMDocumentData('123', undefined)).toBe(undefined)
  })

  it('returns undefined if the trace id is missing', () => {
    expect(createAPMDocumentData(undefined, '456')).toBe(undefined)
  })

  it('returns undefined if the trace id is empty', () => {
    expect(createAPMDocumentData('', '456')).toBe(undefined)
  })
})

function createDocument(content: string) {
  return new DOMParser().parseFromString(content, 'text/html')
}
