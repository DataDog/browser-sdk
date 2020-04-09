import { getElementContent } from '../src/getElementContent'

function element(s: TemplateStringsArray) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(s[0], 'text/html')
  return doc.body.children[0]
}

describe('getElementContent', () => {
  it('extracts the text content of an element', () => {
    expect(getElementContent(element`<div>Foo <div>bar</div></div>`)).toBe('Foo bar')
  })

  it('extracts the text of an input button', () => {
    expect(getElementContent(element`<input type="button" value="Click" />`)).toBe('Click')
  })

  it('extracts the alt text of an image', () => {
    expect(getElementContent(element`<img title="foo" alt="bar" />`)).toBe('bar')
  })

  it('extracts the title text of an image', () => {
    expect(getElementContent(element`<img title="foo" />`)).toBe('foo')
  })

  it('extracts the text of an aria-label attribute', () => {
    expect(getElementContent(element`<span aria-label="Foo" />`)).toBe('Foo')
  })

  it('gets the parent element content if everything else fails', () => {
    const root = element`<div>Foo <img /></div>`
    expect(getElementContent(root.querySelector('img')!)).toBe('Foo')
  })

  it("doesn't get the value of a text input", () => {
    expect(getElementContent(element`<input type="text" value="foo" />`)).toBe('')
  })

  it("doesn't get the value of a password input", () => {
    expect(getElementContent(element`<input type="password" value="foo" />`)).toBe('')
  })

  it('limits the content length to a reasonable size', () => {
    expect(
      getElementContent(
        // tslint:disable-next-line max-line-length
        element`<div>Foooooooooooooooooo baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaar baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaz</div>`
      )
    ).toBe(
      // tslint:disable-next-line max-line-length
      'Foooooooooooooooooo baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaar baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa [...]'
    )
  })
})
