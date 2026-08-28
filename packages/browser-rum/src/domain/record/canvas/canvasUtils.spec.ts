import { isCanvasElement, isCanvasSizeAttribute } from './canvasUtils'

describe('canvasUtils', () => {
  it('identifies only canvas elements', () => {
    expect(isCanvasElement(document.createElement('canvas'))).toBeTrue()
    expect(isCanvasElement(document.createElement('div'))).toBeFalse()
    expect(isCanvasElement(document.createTextNode('canvas'))).toBeFalse()
  })

  it('identifies canvas size attributes', () => {
    expect(isCanvasSizeAttribute('width')).toBeTrue()
    expect(isCanvasSizeAttribute('HEIGHT')).toBeTrue()
    expect(isCanvasSizeAttribute('class')).toBeFalse()
  })
})
