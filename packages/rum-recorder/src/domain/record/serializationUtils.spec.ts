import {
  makeStylesheetUrlsAbsolute,
  getSerializedNodeId,
  hasSerializedNode,
  setSerializedNode,
  makeSrcsetUrlsAbsolute,
  makeUrlAbsolute,
} from './serializationUtils'

describe('serialized Node storage in DOM Nodes', () => {
  describe('hasSerializedNode', () => {
    it('returns false for DOM Nodes that are not yet serialized', () => {
      expect(hasSerializedNode(document.createElement('div'))).toBe(false)
    })

    it('returns true for DOM Nodes that have been serialized', () => {
      const node = document.createElement('div')
      setSerializedNode(node, {} as any)

      expect(hasSerializedNode(node)).toBe(true)
    })
  })

  describe('getSerializedNodeId', () => {
    it('returns undefined for DOM Nodes that are not yet serialized', () => {
      expect(getSerializedNodeId(document.createElement('div'))).toBe(undefined)
    })

    it('returns the serialized Node id', () => {
      const node = document.createElement('div')
      setSerializedNode(node, { id: 42 } as any)

      expect(getSerializedNodeId(node)).toBe(42)
    })
  })
})

describe('absolute url to stylesheet', () => {
  const href = 'http://localhost/css/style.css'

  it('can handle relative path', () => {
    expect(makeStylesheetUrlsAbsolute('url(a.jpg)', href)).toEqual(`url(http://localhost/css/a.jpg)`)
  })

  it('can handle same level path', () => {
    expect(makeStylesheetUrlsAbsolute('url("./a.jpg")', href)).toEqual(`url("http://localhost/css/a.jpg")`)
  })

  it('can handle parent level path', () => {
    expect(makeStylesheetUrlsAbsolute('url("../a.jpg")', href)).toEqual(`url("http://localhost/a.jpg")`)
  })

  it('can handle absolute path', () => {
    expect(makeStylesheetUrlsAbsolute('url("/a.jpg")', href)).toEqual(`url("http://localhost/a.jpg")`)
  })

  it('can handle external path', () => {
    expect(makeStylesheetUrlsAbsolute('url("http://localhost/a.jpg")', href)).toEqual(`url("http://localhost/a.jpg")`)
  })

  it('can handle single quote path', () => {
    expect(makeStylesheetUrlsAbsolute(`url('./a.jpg')`, href)).toEqual(`url('http://localhost/css/a.jpg')`)
  })

  it('can handle no quote path', () => {
    expect(makeStylesheetUrlsAbsolute('url(./a.jpg)', href)).toEqual(`url(http://localhost/css/a.jpg)`)
  })

  it('can handle multiple no quote paths', () => {
    expect(
      makeStylesheetUrlsAbsolute(
        'background-image: url(images/b.jpg);background: #aabbcc url(images/a.jpg) 50% 50% repeat;',
        href
      )
    ).toEqual(
      `background-image: url(http://localhost/css/images/b.jpg);` +
        `background: #aabbcc url(http://localhost/css/images/a.jpg) 50% 50% repeat;`
    )
  })

  it('can handle data url image', () => {
    expect(makeStylesheetUrlsAbsolute('url(data:image/gif;base64,ABC)', href)).toEqual('url(data:image/gif;base64,ABC)')
    expect(makeStylesheetUrlsAbsolute('url(data:application/font-woff;base64,d09GMgABAAAAAAm)', href)).toEqual(
      'url(data:application/font-woff;base64,d09GMgABAAAAAAm)'
    )
  })

  it('preserves quotes around inline svgs with spaces', () => {
    /* eslint-disable max-len */
    expect(
      makeStylesheetUrlsAbsolute(
        "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Cpath fill='%2328a745' d='M3'/%3E%3C/svg%3E\")",
        href
      )
    ).toEqual(
      "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Cpath fill='%2328a745' d='M3'/%3E%3C/svg%3E\")"
    )
    expect(
      makeStylesheetUrlsAbsolute(
        'url(\'data:image/svg+xml;utf8,<svg width="28" height="32" viewBox="0 0 28 32" xmlns="http://www.w3.org/2000/svg"><path d="M27 14C28" fill="white"/></svg>\')',
        href
      )
    ).toEqual(
      'url(\'data:image/svg+xml;utf8,<svg width="28" height="32" viewBox="0 0 28 32" xmlns="http://www.w3.org/2000/svg"><path d="M27 14C28" fill="white"/></svg>\')'
    )
    /* eslint-enable max-len */
  })
  it('can handle empty path', () => {
    expect(makeStylesheetUrlsAbsolute(`url('')`, href)).toEqual(`url('')`)
  })
})

describe('makeSrcsetUrlsAbsolute', () => {
  it('returns an empty string if the value is empty', () => {
    expect(makeSrcsetUrlsAbsolute('', 'https://example.org')).toBe('')
  })

  it('replaces urls in all image sources', () => {
    expect(makeSrcsetUrlsAbsolute('elva-fairy-480w.jpg 480w, elva-fairy-800w.jpg 800w', 'https://example.org')).toBe(
      'https://example.org/elva-fairy-480w.jpg 480w, https://example.org/elva-fairy-800w.jpg 800w'
    )
  })

  it('works with image sources without a descriptor', () => {
    expect(makeSrcsetUrlsAbsolute('elva-fairy-480w.jpg, elva-fairy-800w.jpg', 'https://example.org')).toBe(
      'https://example.org/elva-fairy-480w.jpg, https://example.org/elva-fairy-800w.jpg'
    )
  })
})

describe('makeUrlAbsolute', () => {
  it('makes an absolute URL from a relative path', () => {
    expect(makeUrlAbsolute('bar', 'http://example.org/foo/')).toBe('http://example.org/foo/bar')
  })

  it('makes an absolute URL from an absolute path', () => {
    expect(makeUrlAbsolute('/bar', 'http://example.org/foo/')).toBe('http://example.org/bar')
  })

  it('do not change data URI', () => {
    expect(makeUrlAbsolute('data:image/gif;base64,ABC', 'http://example.org/foo/')).toBe('data:image/gif;base64,ABC')
  })
})
