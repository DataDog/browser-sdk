import type { RumMutationRecord } from '@datadog/browser-rum-core'
import { isElementNode } from '@datadog/browser-rum-core'
import type { CanvasManager } from './canvasManager'

const CANVAS_SIZE_ATTRIBUTES = ['width', 'height']

/**
 * Canvas dimensions can be changed through several APIs, including the `width` and `height`
 * properties and their corresponding attributes. The mutation observer consolidates these paths
 * into attribute mutation records so that the canvas can be marked dirty consistently.
 */
export function markCanvasDirtyFromMutationRecords(mutations: RumMutationRecord[], canvasManager: CanvasManager): void {
  for (const mutation of mutations) {
    if (
      mutation.type === 'attributes' &&
      isCanvasElement(mutation.target) &&
      !mutation.attributeNamespace &&
      isCanvasSizeAttribute(mutation.attributeName)
    ) {
      canvasManager.markCanvasDirty(mutation.target)
    }
  }
}

export function isCanvasElement(node: Node): node is HTMLCanvasElement {
  return isElementNode(node) && node.tagName.toLowerCase() === 'canvas'
}

function isCanvasSizeAttribute(attributeName: string): boolean {
  return CANVAS_SIZE_ATTRIBUTES.includes(attributeName.toLowerCase())
}
