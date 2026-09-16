import { mockable } from '@datadog/browser-core'
import { globalObject } from '@datadog/js-core/util'
import type { CanvasSnapshot } from './canvasSnapshot'
import { createDownscaledCanvas } from './canvasSnapshot'

export function computeImageHash(snapshot: CanvasSnapshot, maxHashDimension: number): Promise<string | undefined> {
  const { height: sourceHeight, width: sourceWidth } = snapshot.source
  // The snapshot is already frozen, so if it already fits, hash it directly instead of downscaling it again.
  const thumbnail =
    Math.max(sourceWidth, sourceHeight) <= maxHashDimension
      ? snapshot.source
      : createDownscaledCanvas(snapshot.source, sourceWidth, sourceHeight, maxHashDimension)
  if (!thumbnail) {
    return Promise.resolve(undefined)
  }

  const context = thumbnail.getContext('2d')
  if (!context) {
    return Promise.resolve(undefined)
  }

  const data = context.getImageData(0, 0, thumbnail.width, thumbnail.height).data
  // crypto.subtle is only exposed in secure contexts, so it is missing on plain HTTP pages.
  const subtleCrypto = mockable(globalObject.crypto?.subtle)
  if (!subtleCrypto) {
    return Promise.resolve(createChangeHash(snapshot.canvasWidth, snapshot.canvasHeight, fnv1aHash(data)))
  }

  return subtleCrypto.digest('SHA-256', data).then(
    (buffer) => createChangeHash(snapshot.canvasWidth, snapshot.canvasHeight, arrayBufferToHex(buffer)),
    () => createChangeHash(snapshot.canvasWidth, snapshot.canvasHeight, fnv1aHash(data))
  )
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function createChangeHash(width: number, height: number, pixelHash: string): string {
  return `${width}x${height}:${pixelHash}`
}

/* eslint-disable no-bitwise */
function fnv1aHash(data: ArrayLike<number>): string {
  let hash = 0x811c9dc5

  for (let index = 0; index < data.length; index += 1) {
    hash ^= data[index]
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}
/* eslint-enable no-bitwise */
