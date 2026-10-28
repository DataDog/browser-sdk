import { noop } from '@datadog/js-core/util'

export interface CanvasSnapshot {
  canvasHeight: number
  canvasWidth: number
  /** Downscaled to the recorded image dimensions. Capturing consumes it, see `copyCanvasSnapshot`. */
  bitmap: Promise<ImageBitmap>
}

// createImageBitmap copies the canvas synchronously, so the snapshot is not affected by later draws, and
// a WebGL drawing buffer is read before the browser discards it.
export function createCanvasSnapshot(canvas: HTMLCanvasElement, maxImageDimension: number): CanvasSnapshot {
  const canvasWidth = canvas.width
  const canvasHeight = canvas.height
  const [resizeWidth, resizeHeight] = getDownscaledSize(canvasWidth, canvasHeight, maxImageDimension)
  const bitmap = createImageBitmap(canvas, { resizeWidth, resizeHeight, resizeQuality: 'low' })
  // Avoid an unhandled rejection if the snapshot is never captured. Captures still see the rejection.
  bitmap.catch(noop)

  return { canvasHeight, canvasWidth, bitmap }
}

// Keeps a stored snapshot usable after a capture consumed the copy
export function copyCanvasSnapshot(snapshot: CanvasSnapshot): CanvasSnapshot {
  return { ...snapshot, bitmap: snapshot.bitmap.then((bitmap) => createImageBitmap(bitmap)) }
}

function getDownscaledSize(width: number, height: number, maxDimension: number): [number, number] {
  const scale = Math.min(1, maxDimension / Math.max(width, height))
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))]
}
