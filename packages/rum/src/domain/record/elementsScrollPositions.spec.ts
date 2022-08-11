import { createElementsScrollPositions } from './elementsScrollPositions'

describe('elementsScrollPositions', () => {
  beforeEach(() => {
    document.body.style.setProperty('height', '5000px')
    document.body.style.setProperty('width', '5000px')
    window.scroll(10, 20)
  })

  afterEach(() => {
    window.scroll(0, 0)
    document.body.style.removeProperty('height')
    document.body.style.removeProperty('width')
  })

  it('should attach document scroll positions to document scrolling element', () => {
    const elementsScrollPositions = createElementsScrollPositions()

    elementsScrollPositions.set(document, { scrollLeft: 10, scrollTop: 20 })

    expect(elementsScrollPositions.get(document.scrollingElement!)).toEqual({ scrollLeft: 10, scrollTop: 20 })
  })

  it('should attach document scroll positions to unavailable document scrolling element', () => {
    const documentScrollingElement = document.scrollingElement!
    Object.defineProperty(document, 'scrollingElement', { value: null, configurable: true })
    const elementsScrollPositions = createElementsScrollPositions()
    elementsScrollPositions.set(document, { scrollLeft: 10, scrollTop: 20 })

    expect(elementsScrollPositions.get(documentScrollingElement)).toEqual({ scrollLeft: 10, scrollTop: 20 })
    Object.defineProperty(document, 'scrollingElement', { value: documentScrollingElement, configurable: true })
  })

  it('should not attach document scroll positions if no scrolling element find', () => {
    window.scroll(30, 40)
    const documentScrollingElement = document.scrollingElement!
    Object.defineProperty(document, 'scrollingElement', { value: null, configurable: true })
    const elementsScrollPositions = createElementsScrollPositions()

    elementsScrollPositions.set(document, { scrollLeft: 10, scrollTop: 20 })

    expect(elementsScrollPositions.get(documentScrollingElement)).toBeUndefined()
    Object.defineProperty(document, 'scrollingElement', { value: documentScrollingElement, configurable: true })
  })
})
