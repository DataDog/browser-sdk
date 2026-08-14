import { instrumentMethod, instrumentSetter } from '@datadog/browser-core'
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

  if (typeof HTMLCanvasElement !== 'undefined') {
    instrumentationStoppers.push(
      instrumentSetter(HTMLCanvasElement.prototype, 'width', markCanvasDirty),
      instrumentSetter(HTMLCanvasElement.prototype, 'height', markCanvasDirty),
      instrumentMethod(Element.prototype, 'setAttribute', ({ target, parameters, onPostCall }) => {
        if (target instanceof HTMLCanvasElement && isCanvasSizeAttribute(parameters[0])) {
          onPostCall(() => markCanvasDirty(target))
        }
      }),
      instrumentMethod(Element.prototype, 'removeAttribute', ({ target, parameters, onPostCall }) => {
        if (
          target instanceof HTMLCanvasElement &&
          isCanvasSizeAttribute(parameters[0]) &&
          target.hasAttribute(parameters[0])
        ) {
          onPostCall(() => markCanvasDirty(target))
        }
      })
    )
  }

  return {
    stop: () => instrumentationStoppers.forEach((stopper) => stopper.stop()),
  }
}

function isCanvasSizeAttribute(attributeName: string): boolean {
  return CANVAS_SIZE_ATTRIBUTES.includes(attributeName.toLowerCase())
}
