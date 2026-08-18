import type { RumMutationRecord } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { createCanvasManager } from './canvasManager'
import { isCanvasElement, markCanvasDirtyFromMutationRecords } from './canvasUtils'

describe('canvasUtils', () => {
  function createAttributeMutation(
    target: Element,
    attributeName: string,
    attributeNamespace: string | null = null
  ): RumMutationRecord {
    return { type: 'attributes', target, attributeName, attributeNamespace, oldValue: null }
  }

  function appendCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    document.body.appendChild(canvas)
    registerCleanupTask(() => canvas.remove())
    return canvas
  }

  it('marks canvases dirty for width and height attribute mutations', () => {
    const canvas = appendCanvas()
    const canvasManager = createCanvasManager()

    markCanvasDirtyFromMutationRecords([createAttributeMutation(canvas, 'width')], canvasManager)
    expect(canvasManager.isCanvasDirty(canvas)).toBeTrue()

    canvasManager.markCanvasClean(canvas)
    markCanvasDirtyFromMutationRecords([createAttributeMutation(canvas, 'height')], canvasManager)

    expect(canvasManager.isCanvasDirty(canvas)).toBeTrue()
  })

  it('does not mark canvases dirty for unrelated attributes', () => {
    const canvas = appendCanvas()
    const canvasManager = createCanvasManager()

    markCanvasDirtyFromMutationRecords([createAttributeMutation(canvas, 'class')], canvasManager)

    expect(canvasManager.isCanvasDirty(canvas)).toBeFalse()
  })

  it('does not mark canvases dirty for namespaced size attributes', () => {
    const canvas = appendCanvas()
    const canvasManager = createCanvasManager()

    markCanvasDirtyFromMutationRecords([createAttributeMutation(canvas, 'width', 'urn:example')], canvasManager)

    expect(canvasManager.isCanvasDirty(canvas)).toBeFalse()
  })

  it('identifies only canvas elements', () => {
    expect(isCanvasElement(document.createElement('canvas'))).toBeTrue()
    expect(isCanvasElement(document.createElement('div'))).toBeFalse()
    expect(isCanvasElement(document.createTextNode('canvas'))).toBeFalse()
  })
})
