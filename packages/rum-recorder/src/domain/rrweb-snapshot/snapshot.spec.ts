/* eslint-disable max-len */
import { absoluteToStylesheet } from './snapshot'

describe('absolute url to stylesheet', () => {
  const href = 'http://localhost/css/style.css'

  it('can handle relative path', () => {
    expect(absoluteToStylesheet('url(a.jpg)', href)).toEqual(`url(http://localhost/css/a.jpg)`)
  })

  it('can handle same level path', () => {
    expect(absoluteToStylesheet('url("./a.jpg")', href)).toEqual(`url("http://localhost/css/a.jpg")`)
  })

  it('can handle parent level path', () => {
    expect(absoluteToStylesheet('url("../a.jpg")', href)).toEqual(`url("http://localhost/a.jpg")`)
  })

  it('can handle absolute path', () => {
    expect(absoluteToStylesheet('url("/a.jpg")', href)).toEqual(`url("http://localhost/a.jpg")`)
  })

  it('can handle external path', () => {
    expect(absoluteToStylesheet('url("http://localhost/a.jpg")', href)).toEqual(`url("http://localhost/a.jpg")`)
  })

  it('can handle single quote path', () => {
    expect(absoluteToStylesheet(`url('./a.jpg')`, href)).toEqual(`url('http://localhost/css/a.jpg')`)
  })

  it('can handle no quote path', () => {
    expect(absoluteToStylesheet('url(./a.jpg)', href)).toEqual(`url(http://localhost/css/a.jpg)`)
  })

  it('can handle multiple no quote paths', () => {
    expect(
      absoluteToStylesheet(
        'background-image: url(images/b.jpg);background: #aabbcc url(images/a.jpg) 50% 50% repeat;',
        href
      )
    ).toEqual(
      `background-image: url(http://localhost/css/images/b.jpg);` +
        `background: #aabbcc url(http://localhost/css/images/a.jpg) 50% 50% repeat;`
    )
  })

  it('can handle data url image', () => {
    expect(absoluteToStylesheet('url(data:image/gif;base64,ABC)', href)).toEqual('url(data:image/gif;base64,ABC)')
    expect(absoluteToStylesheet('url(data:application/font-woff;base64,d09GMgABAAAAAAm)', href)).toEqual(
      'url(data:application/font-woff;base64,d09GMgABAAAAAAm)'
    )
  })

  it('preserves quotes around inline svgs with spaces', () => {
    expect(
      absoluteToStylesheet(
        "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Cpath fill='%2328a745' d='M3'/%3E%3C/svg%3E\")",
        href
      )
    ).toEqual(
      "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Cpath fill='%2328a745' d='M3'/%3E%3C/svg%3E\")"
    )
    expect(
      absoluteToStylesheet(
        'url(\'data:image/svg+xml;utf8,<svg width="28" height="32" viewBox="0 0 28 32" xmlns="http://www.w3.org/2000/svg"><path d="M27 14C28" fill="white"/></svg>\')',
        href
      )
    ).toEqual(
      'url(\'data:image/svg+xml;utf8,<svg width="28" height="32" viewBox="0 0 28 32" xmlns="http://www.w3.org/2000/svg"><path d="M27 14C28" fill="white"/></svg>\')'
    )
  })
  it('can handle empty path', () => {
    expect(absoluteToStylesheet(`url('')`, href)).toEqual(`url('')`)
  })
})
