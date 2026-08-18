import { instrumentMethod } from '@datadog/browser-core'
import type { RumMutationRecord } from '@datadog/browser-rum-core'
import { forEachChildNodes, isElementNode } from '@datadog/browser-rum-core'
import type { CanvasManager } from '../canvas/canvasManager'
import type { Tracker } from './tracker.types'

export type MarkCanvasDirty = (canvas: HTMLCanvasElement) => void

type Canvas2DDrawingMethod =
  | 'clearRect'
  | 'fillRect'
  | 'strokeRect'
  | 'fill'
  | 'stroke'
  | 'fillText'
  | 'strokeText'
  | 'drawImage'
  | 'putImageData'
  | 'drawFocusIfNeeded'
  | 'reset'

const CANVAS_2D_DRAWING_METHODS: readonly Canvas2DDrawingMethod[] = [
  'clearRect',
  'fillRect',
  'strokeRect',
  'fill',
  'stroke',
  'fillText',
  'strokeText',
  'drawImage',
  'putImageData',
  'drawFocusIfNeeded',
  'reset',
]

const CANVAS_SIZE_ATTRIBUTES = ['width', 'height']

export function trackCanvas2DMutations(markCanvasDirty: MarkCanvasDirty): Tracker {
  const instrumentationStoppers: Tracker[] = []

  if (typeof CanvasRenderingContext2D !== 'undefined') {
    CANVAS_2D_DRAWING_METHODS.forEach((method) => {
      instrumentationStoppers.push(
        instrumentMethod(CanvasRenderingContext2D.prototype, method, ({ target: context, onPostCall }) => {
          onPostCall(() => markCanvasDirty(context.canvas))
        })
      )
    })
  }

  return {
    stop: () => instrumentationStoppers.forEach((stopper) => stopper.stop()),
  }
}

/**
 * Canvas dimensions can be changed through several APIs, including the `width` and `height`
 * properties and their corresponding attributes. The mutation observer consolidates these paths
 * into attribute mutation records so that the canvas can be marked dirty consistently.
 */
export function markCanvasDirtyFromMutationRecords(
  mutations: RumMutationRecord[],
  canvasManager: CanvasManager | undefined
): void {
  if (!canvasManager) {
    return
  }

  for (const mutation of mutations) {
    if (
      mutation.type === 'attributes' &&
      isCanvasElement(mutation.target) &&
      (mutation.attributeNamespace === null || mutation.attributeNamespace === undefined) &&
      isCanvasSizeAttribute(mutation.attributeName)
    ) {
      canvasManager.markCanvasDirty(mutation.target)
    }
  }
}

export function markCanvasAndDescendantsDirty(node: Node, canvasManager: CanvasManager): void {
  if (isCanvasElement(node)) {
    canvasManager.markCanvasDirty(node)
  }
  forEachChildNodes(node, (childNode) => markCanvasAndDescendantsDirty(childNode, canvasManager))
}

function isCanvasElement(node: Node): node is HTMLCanvasElement {
  return isElementNode(node) && node.tagName.toLowerCase() === 'canvas'
}

function isCanvasSizeAttribute(attributeName: string): boolean {
  return CANVAS_SIZE_ATTRIBUTES.includes(attributeName.toLowerCase())
}
