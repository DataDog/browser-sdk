import { getLayoutViewportDimensions } from './viewports'

describe('getLayoutViewportDimensions', () => {
  it('initially normalizes width and scroll dimention', () => {
    const SCROLL_DOWN_PX = 100

    document.body.style.setProperty('margin-bottom', '2000px')

    const layoutDimensions = getLayoutViewportDimensions()
    const initialInnerWidth = window.innerWidth
    const initialInnerHeight = window.innerHeight

    expect(layoutDimensions).toEqual({
      scrollX: 0,
      scrollY: 0,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    })

    window.scrollTo(0, SCROLL_DOWN_PX)

    expect(getLayoutViewportDimensions()).toEqual({
      scrollX: 0,
      scrollY: SCROLL_DOWN_PX,
      innerWidth: initialInnerWidth,
      innerHeight: initialInnerHeight,
    })
    document.body.style.removeProperty('margin-bottom')
  })
})
