import type { CanvasCaptureResponse } from '@datadog/browser-core'
import { replaceMockable } from '@datadog/browser-core/test'
import { globalObject } from '@datadog/js-core/util'
import { captureCanvas } from './canvas'
import { createAction, createPixelsAction } from './canvas.specHelper'

describe('captureCanvas', () => {
  beforeEach(() => {
    if (typeof OffscreenCanvas === 'undefined') {
      pending('OffscreenCanvas not supported')
    }
  })

  it('returns the hash and the encoded image', async () => {
    const response = await captureCanvas(createAction('red'))

    expect(response).toEqual({ type: 'canvasCaptured', id: 1, hash: jasmine.any(String), image: jasmine.any(Blob) })
    expectRed(await readFirstPixel((response as CapturedResponse).image))
  })

  it('downscales the bitmap before hashing it when it does not fit the hashing dimension', async () => {
    const response = (await captureCanvas(createAction('red', { hashingMaxDimension: 1 }))) as CapturedResponse

    expect(response.type).toBe('canvasCaptured')
    expect(response.hash).not.toBe(((await captureCanvas(createAction('red'))) as CapturedResponse).hash)
    expectRed(await readFirstPixel(response.image))
  })

  it('does not encode the image when the hash matches the last capture', async () => {
    const { hash } = (await captureCanvas(createAction('red'))) as CapturedResponse

    expect(await captureCanvas(createAction('red', { lastChangeHash: hash }))).toEqual({
      type: 'canvasUnchanged',
      id: 1,
    })
  })

  it('returns a different hash when the content changes', async () => {
    const red = (await captureCanvas(createAction('red'))) as CapturedResponse
    const blue = (await captureCanvas(createAction('blue'))) as CapturedResponse

    expect(blue.hash).not.toBe(red.hash)
  })

  it('returns a different hash when the canvas dimensions change but the bitmap does not', async () => {
    const small = (await captureCanvas(createAction('red', { canvasWidth: 2 }))) as CapturedResponse
    const large = (await captureCanvas(createAction('red', { canvasWidth: 4 }))) as CapturedResponse

    expect(large.hash).not.toBe(small.hash)
  })

  it('hashes the image when SubtleCrypto is unavailable', async () => {
    replaceMockable(globalObject.crypto?.subtle, undefined)

    const red = (await captureCanvas(createAction('red'))) as CapturedResponse
    const sameRed = (await captureCanvas(createAction('red'))) as CapturedResponse
    const blue = (await captureCanvas(createAction('blue'))) as CapturedResponse

    expect(sameRed.hash).toBe(red.hash)
    expect(blue.hash).not.toBe(red.hash)
  })

  it('hashes the image when the digest fails', async () => {
    replaceMockable(globalObject.crypto?.subtle, {
      digest: () => Promise.reject(new Error('unsupported')),
    } as unknown as SubtleCrypto)

    const red = (await captureCanvas(createAction('red'))) as CapturedResponse
    const blue = (await captureCanvas(createAction('blue'))) as CapturedResponse

    expect(blue.hash).not.toBe(red.hash)
  })

  it('fails when no 2d context is available', async () => {
    const action = createAction('red')
    spyOn(OffscreenCanvas.prototype, 'getContext').and.returnValue(null)

    expect(await captureCanvas(action)).toEqual({ type: 'canvasCaptureFailed', id: 1, errorName: 'Error' })
  })

  it('fails with the error name when encoding throws', async () => {
    spyOn(OffscreenCanvas.prototype, 'convertToBlob').and.callFake(() =>
      Promise.reject(new DOMException('encoding failed', 'EncodingError'))
    )

    expect(await captureCanvas(createAction('red'))).toEqual({
      type: 'canvasCaptureFailed',
      id: 1,
      errorName: 'EncodingError',
    })
  })

  it('closes the bitmap', async () => {
    const action = createAction('red')
    const closeSpy = spyOn(action.bitmap, 'close').and.callThrough()

    await captureCanvas(action)

    expect(closeSpy).toHaveBeenCalled()
  })

  it('closes the bitmap when the capture fails', async () => {
    const action = createAction('red')
    const closeSpy = spyOn(action.bitmap, 'close').and.callThrough()
    spyOn(OffscreenCanvas.prototype, 'getContext').and.returnValue(null)

    await captureCanvas(action)

    expect(closeSpy).toHaveBeenCalled()
  })

  describe('with WebGPU pixels', () => {
    it('captures BGRA pixels with padded rows', async () => {
      const response = (await captureCanvas(
        createPixelsAction([0, 0, 255, 255], { format: 'bgra8unorm' })
      )) as CapturedResponse

      expect(response.type).toBe('canvasCaptured')
      expectRed(await readFirstPixel(response.image))
    })

    it('ignores the texture alpha of an opaque canvas', async () => {
      const response = (await captureCanvas(createPixelsAction([255, 0, 0, 0]))) as CapturedResponse

      expectRed(await readFirstPixel(response.image))
    })

    it('unpremultiplies the pixels of a premultiplied canvas', async () => {
      const response = (await captureCanvas(
        createPixelsAction([128, 0, 0, 128], { alphaMode: 'premultiplied' })
      )) as CapturedResponse

      const [red, green, blue, alpha] = await readFirstPixel(response.image)
      expect(red).toBeGreaterThan(240)
      expect(green).toBeLessThan(15)
      expect(blue).toBeLessThan(15)
      expect(Math.abs(alpha - 128)).toBeLessThan(10)
    })

    it('downscales the pixels to fit the maximum image dimension', async () => {
      const response = (await captureCanvas(
        createPixelsAction([255, 0, 0, 255], { width: 4, height: 2, maxImageDimension: 2 })
      )) as CapturedResponse

      const bitmap = await createImageBitmap(response.image)
      expect([bitmap.width, bitmap.height]).toEqual([2, 1])
    })
  })
})

type CapturedResponse = Extract<CanvasCaptureResponse, { type: 'canvasCaptured' }>

async function readFirstPixel(image: Blob): Promise<number[]> {
  const bitmap = await createImageBitmap(image)
  const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!
  context.drawImage(bitmap, 0, 0)
  return Array.from(context.getImageData(0, 0, 1, 1).data)
}

// Lossy WebP encoding can shift channel values by a few units
function expectRed([red, green, blue, alpha]: number[]) {
  expect(red).toBeGreaterThan(240)
  expect(green).toBeLessThan(15)
  expect(blue).toBeLessThan(15)
  expect(alpha).toBe(255)
}
