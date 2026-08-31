import { mockable } from '@datadog/browser-core'
import { globalObject } from '@datadog/js-core/util'

/**
 * An immutable, downscaled copy of a canvas' pixels. Taking it once and reusing it for both
 * hashing and encoding guarantees that the hash we emit describes the image we emit, even if
 * the canvas is drawn to while the capture is in flight.
 */
export interface CanvasSnapshot {
  canvasHeight: number
  canvasWidth: number
  close: () => void
  height: number
  source: CanvasImageSource
  width: number
}

export function createCanvasSnapshot(
  canvas: HTMLCanvasElement,
  maxImageDimension: number
): Promise<CanvasSnapshot | undefined> {
  const canvasWidth = canvas.width
  const canvasHeight = canvas.height
  const scale = Math.min(1, maxImageDimension / Math.max(canvasWidth, canvasHeight))
  const width = Math.max(1, Math.round(canvasWidth * scale))
  const height = Math.max(1, Math.round(canvasHeight * scale))
  const createImageBitmap = mockable(globalObject.createImageBitmap)

  // TODO revisit fallback. Three fallback routes to createCanvasSnapshotWithCanvas() are disabled
  // here: the missing-API guard, the rejection handler and a try/catch around the call. They are
  // off on purpose so that CI tells us which browser versions cannot capture without them; with
  // the fallback in place, a browser lacking createImageBitmap captures successfully and stays
  // invisible to us.
  // if (!createImageBitmap) {
  //   return Promise.resolve(createCanvasSnapshotWithCanvas(canvas, canvasWidth, canvasHeight, width, height))
  // }

  return createImageBitmap(canvas, {
    resizeHeight: height,
    resizeQuality: 'low',
    resizeWidth: width,
  }).then((imageBitmap) => ({
    canvasHeight,
    canvasWidth,
    close: () => imageBitmap.close(),
    height,
    source: imageBitmap,
    width,
  }))
}

// TODO revisit fallback.
// function createCanvasSnapshotWithCanvas(
//   canvas: HTMLCanvasElement,
//   canvasWidth: number,
//   canvasHeight: number,
//   width: number,
//   height: number
// ): CanvasSnapshot | undefined {
//   const snapshotCanvas = document.createElement('canvas')
//   snapshotCanvas.width = width
//   snapshotCanvas.height = height
//
//   const context = snapshotCanvas.getContext('2d')
//   if (!context) {
//     return undefined
//   }
//
//   context.imageSmoothingQuality = 'low'
//   context.drawImage(canvas, 0, 0, width, height)
//
//   return { canvasHeight, canvasWidth, close: noop, height, source: snapshotCanvas, width }
// }

export function captureCanvasImage(snapshot: CanvasSnapshot): Promise<Blob | undefined> {
  const imageCanvas = document.createElement('canvas')
  imageCanvas.width = snapshot.width
  imageCanvas.height = snapshot.height

  const context = imageCanvas.getContext('2d')
  if (!context) {
    return Promise.resolve(undefined)
  }

  try {
    context.drawImage(snapshot.source, 0, 0)
    return canvasToBlob(imageCanvas)
  } catch {
    return Promise.resolve(undefined)
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | undefined> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob ?? undefined), 'image/png')
    } catch {
      resolve(undefined)
    }
  })
}
