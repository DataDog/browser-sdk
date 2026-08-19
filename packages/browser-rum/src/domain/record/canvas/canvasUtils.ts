import { isElementNode } from '@datadog/browser-rum-core'

const CANVAS_SIZE_ATTRIBUTES = ['width', 'height']

export function isCanvasElement(node: Node): node is HTMLCanvasElement {
  return isElementNode(node) && node.tagName === 'CANVAS'
}

export function isCanvasSizeAttribute(attributeName: string): boolean {
  return CANVAS_SIZE_ATTRIBUTES.includes(attributeName.toLowerCase())
}
