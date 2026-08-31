import { mockable } from '@datadog/browser-core'
import { globalObject } from '@datadog/js-core/util'
import type { CanvasSnapshot } from './canvasSnapshot'

/**
 * Hashes a snapshot to detect whether a canvas' content changed between captures. The hash is
 * computed on a thumbnail rather than on the full image so that the comparison stays cheap
 * regardless of the canvas size, and it includes the canvas dimensions so that a resize is
 * always considered a change.
 */
export function computeImageHash(snapshot: CanvasSnapshot, maxHashDimension: number): Promise<string | undefined> {
  const scale = Math.min(1, maxHashDimension / Math.max(snapshot.width, snapshot.height))
  const width = Math.max(1, Math.round(snapshot.width * scale))
  const height = Math.max(1, Math.round(snapshot.height * scale))

  const thumbnail = document.createElement('canvas')
  thumbnail.width = width
  thumbnail.height = height

  const context = thumbnail.getContext('2d')
  if (!context) {
    return Promise.resolve(undefined)
  }
  context.imageSmoothingQuality = 'low'
  context.drawImage(snapshot.source, 0, 0, width, height)

  const data = context.getImageData(0, 0, width, height).data
  const subtleCrypto = mockable(globalObject.crypto?.subtle)
  // TODO revisit fallback.
  // if (!subtleCrypto) {
  //   return Promise.resolve(createChangeHash(snapshot.canvasWidth, snapshot.canvasHeight, fnv1aHash(data)))
  // }

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
