import { globalObject } from '@datadog/js-core/util'
import { replaceMockable } from '../../../test'
import type { CanvasCaptureRequest } from './canvasCapture'
import { captureCanvasBitmap, getDownscaledSize } from './canvasCapture'

describe('getDownscaledSize', () => {
  it('downscales to fit within the maximum dimension', () => {
    expect(getDownscaledSize(4, 2, 2)).toEqual([2, 1])
  })

  it('does not upscale', () => {
    expect(getDownscaledSize(2, 2, 1000)).toEqual([2, 2])
  })

  it('keeps at least one pixel per dimension', () => {
    expect(getDownscaledSize(1000, 1, 10)).toEqual([10, 1])
  })
})

describe('captureCanvasBitmap', () => {
  beforeEach(() => {
    if (typeof OffscreenCanvas === 'undefined') {
      pending('OffscreenCanvas not supported')
    }
  })

  it('returns the same hash for the same content', async () => {
    const first = await capture('red')
    const second = await capture('red')

    expect(first.type).toBe('captured')
    expect(second).toEqual(jasmine.objectContaining({ hash: hashOf(first) }))
  })

  it('returns a different hash when the content changes', async () => {
    const red = await capture('red')
    const blue = await capture('blue')

    expect(hashOf(blue)).not.toBe(hashOf(red))
  })

  it('returns a different hash when the canvas dimensions change but the downscaled pixels do not', async () => {
    const small = await capture('red', { canvasWidth: 2, canvasHeight: 2, hashingMaxDimension: 1 })
    const large = await capture('red', { canvasWidth: 4, canvasHeight: 4, hashingMaxDimension: 1 })

    expect(hashOf(large)).not.toBe(hashOf(small))
  })

  it('does not encode the image when the hash did not change', async () => {
    const first = await capture('red')
    const convertToBlobSpy = spyOn(OffscreenCanvas.prototype, 'convertToBlob').and.callThrough()

    expect(await capture('red', { lastChangeHash: hashOf(first) })).toEqual({ type: 'unchanged', id: 0 })
    expect(convertToBlobSpy).not.toHaveBeenCalled()
  })

  it('encodes the bitmap with its dimensions', async () => {
    const response = await capture('red', {}, 4, 2)

    expect(response.type === 'captured' && (await createImageBitmap(response.image)).width).toBe(4)
  })

  it('closes the bitmap', async () => {
    const bitmap = await createBitmap('red')

    await captureCanvasBitmap(createRequest(bitmap))

    expect(bitmap.width).toBe(0)
  })

  it('reports a failure when reading the pixels throws a SecurityError', async () => {
    spyOn(OffscreenCanvasRenderingContext2D.prototype, 'getImageData').and.throwError(
      new DOMException('tainted', 'SecurityError')
    )

    expect(await capture('red')).toEqual({ type: 'failed', id: 0, isSecurityError: true })
  })

  it('reports a failure when no 2d context is available', async () => {
    const bitmap = await createBitmap('red')
    spyOn(OffscreenCanvas.prototype, 'getContext').and.returnValue(null)

    expect(await captureCanvasBitmap(createRequest(bitmap))).toEqual({ type: 'failed', id: 0, isSecurityError: false })
  })

  it('hashes the image when SubtleCrypto is unavailable', async () => {
    replaceMockable(globalObject.crypto?.subtle, undefined)

    const red = await capture('red')
    const sameRed = await capture('red')
    const blue = await capture('blue')

    expect(hashOf(sameRed)).toBe(hashOf(red))
    expect(hashOf(blue)).not.toBe(hashOf(red))
  })

  it('hashes the image when the digest fails', async () => {
    replaceMockable(globalObject.crypto?.subtle, {
      digest: () => Promise.reject(new Error('unsupported')),
    } as unknown as SubtleCrypto)

    const red = await capture('red')
    const blue = await capture('blue')

    expect(hashOf(red)).toBeDefined()
    expect(hashOf(blue)).not.toBe(hashOf(red))
  })
})

function createBitmap(color: string, width = 2, height = 2) {
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d')!
  context.fillStyle = color
  context.fillRect(0, 0, width, height)
  return createImageBitmap(canvas)
}

function createRequest(bitmap: ImageBitmap, overrides: Partial<CanvasCaptureRequest> = {}): CanvasCaptureRequest {
  return {
    action: 'capture',
    id: 0,
    bitmap,
    canvasWidth: bitmap.width,
    canvasHeight: bitmap.height,
    lastChangeHash: undefined,
    hashingMaxDimension: 100,
    encodeQuality: 0.5,
    ...overrides,
  }
}

async function capture(color: string, overrides: Partial<CanvasCaptureRequest> = {}, width?: number, height?: number) {
  return captureCanvasBitmap(createRequest(await createBitmap(color, width, height), overrides))
}

function hashOf(response: Awaited<ReturnType<typeof captureCanvasBitmap>>) {
  return response.type === 'captured' ? response.hash : undefined
}
