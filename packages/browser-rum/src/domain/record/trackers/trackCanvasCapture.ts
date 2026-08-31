import { clearInterval, mockable, noop, setInterval } from '@datadog/browser-core'
import { getNodePrivacyLevel, NodePrivacyLevel } from '@datadog/browser-rum-core'
import { ONE_SECOND } from '@datadog/js-core/time'
import { globalObject } from '@datadog/js-core/util'
import type { RecordingScope } from '../recordingScope'
import type { NodeId } from '../encoding'
import type { CanvasCaptureAttempt } from '../canvas/canvasManager'
import { CanvasStatus } from '../canvas/canvasManager'
import type { Tracker } from './tracker.types'

export interface CanvasCapture {
  nodeId: NodeId
  changeHash: string
  image: Blob
}

export type CanvasCaptureCallback = (capture: CanvasCapture) => void

export const trackCanvasCapture = (scope: RecordingScope, onCanvasCapture: CanvasCaptureCallback = noop): Tracker => {
  const canvasManager = scope.canvasManager
  const configuration = scope.configuration.sessionReplayCanvasRecording
  const maxFramesPerSecond = configuration?.maxFramesPerSecond ?? 0

  if (!configuration?.enable || maxFramesPerSecond === 0) {
    return { stop: noop }
  }

  let stopped = false
  const captureIntervalId = setInterval(captureDirtyCanvases, ONE_SECOND / maxFramesPerSecond)

  function captureDirtyCanvases() {
    const capturableCanvases = canvasManager.getCapturableCanvases()
    capturableCanvases.forEach((canvas) => {
      const nodeId = scope.nodeIds.get(canvas)
      if (nodeId === undefined) {
        canvasManager.markCanvas(canvas, CanvasStatus.Clean)
        return
      }

      const nodePrivacyLevel = getNodePrivacyLevel(canvas, scope.configuration.defaultPrivacyLevel)
      if (nodePrivacyLevel !== NodePrivacyLevel.ALLOW) {
        return // Keep it dirty so it can be captured if its privacy level becomes allow
      }

      void canvasManager.capture(canvas, (attempt) => captureCanvas(canvas, nodeId, attempt))
    })
  }

  async function captureCanvas(canvas: HTMLCanvasElement, nodeId: NodeId, attempt: CanvasCaptureAttempt) {
    let snapshot: CanvasSnapshot | undefined
    try {
      snapshot = await createCanvasSnapshot(canvas, configuration?.maxImageDimension ?? 1000)
      if (stopped || !attempt.isCurrent()) {
        return
      }
      if (!snapshot) {
        return // snapshot failed; leave it dirty
      }

      const hash = await computeImageHash(snapshot, configuration?.hashingMaxDimension ?? 100)
      if (stopped || !attempt.isCurrent()) {
        return
      }
      if (hash === undefined) {
        return // hashing failed; leave it dirty
      }

      if (hash === attempt.lastChangeHash) {
        attempt.settle(hash)
        return // unchanged: no capture/output
      }

      const image = await captureCanvasImage(snapshot)
      if (stopped || !attempt.isCurrent()) {
        return
      }
      if (!image) {
        return // encoding failed; leave it dirty
      }

      onCanvasCapture({ nodeId, changeHash: hash, image })
      attempt.settle(hash)
    } catch (error) {
      if (!stopped) {
        attempt.fail(error)
      }
    } finally {
      snapshot?.close()
    }
  }

  return {
    stop: () => {
      stopped = true
      clearInterval(captureIntervalId)
    },
  }
}

interface CanvasSnapshot {
  canvasHeight: number
  canvasWidth: number
  close: () => void
  height: number
  source: CanvasImageSource
  width: number
}

function createCanvasSnapshot(
  canvas: HTMLCanvasElement,
  maxImageDimension: number
): Promise<CanvasSnapshot | undefined> {
  const canvasWidth = canvas.width
  const canvasHeight = canvas.height
  const scale = Math.min(1, maxImageDimension / Math.max(canvasWidth, canvasHeight))
  const width = Math.max(1, Math.round(canvasWidth * scale))
  const height = Math.max(1, Math.round(canvasHeight * scale))
  const createImageBitmap = mockable(globalObject.createImageBitmap)

  // TODO revisit fallback.
  if (!createImageBitmap) {
    return Promise.resolve(createCanvasSnapshotWithCanvas(canvas, canvasWidth, canvasHeight, width, height))
  }

  try {
    return createImageBitmap(canvas, {
      resizeHeight: height,
      resizeQuality: 'low',
      resizeWidth: width,
    }).then(
      (imageBitmap) => ({
        canvasHeight,
        canvasWidth,
        close: () => imageBitmap.close(),
        height,
        source: imageBitmap,
        width,
      }),
      () => createCanvasSnapshotWithCanvas(canvas, canvasWidth, canvasHeight, width, height)
    )
  } catch {
    return Promise.resolve(createCanvasSnapshotWithCanvas(canvas, canvasWidth, canvasHeight, width, height))
  }
}

function createCanvasSnapshotWithCanvas(
  canvas: HTMLCanvasElement,
  canvasWidth: number,
  canvasHeight: number,
  width: number,
  height: number
): CanvasSnapshot | undefined {
  const snapshotCanvas = document.createElement('canvas')
  snapshotCanvas.width = width
  snapshotCanvas.height = height

  const context = snapshotCanvas.getContext('2d')
  if (!context) {
    return undefined
  }

  context.imageSmoothingQuality = 'low'
  context.drawImage(canvas, 0, 0, width, height)

  return { canvasHeight, canvasWidth, close: noop, height, source: snapshotCanvas, width }
}

function computeImageHash(snapshot: CanvasSnapshot, maxHashDimension: number): Promise<string | undefined> {
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
  if (!subtleCrypto) {
    return Promise.resolve(createChangeHash(snapshot.canvasWidth, snapshot.canvasHeight, fnv1aHash(data)))
  }

  return subtleCrypto.digest('SHA-256', data).then(
    (buffer) => createChangeHash(snapshot.canvasWidth, snapshot.canvasHeight, arrayBufferToHex(buffer)),
    () => createChangeHash(snapshot.canvasWidth, snapshot.canvasHeight, fnv1aHash(data))
  )
}

function captureCanvasImage(snapshot: CanvasSnapshot): Promise<Blob | undefined> {
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
