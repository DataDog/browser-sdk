import { noop } from '@datadog/browser-core'
import { registerCleanupTask, replaceMockable } from '@datadog/browser-core/test'
import { globalObject } from '@datadog/js-core/util'
import type { CanvasSnapshot } from './canvasSnapshot'
import { computeImageHash } from './canvasHash'

describe('computeImageHash', () => {
  it('returns the same hash for the same content', async () => {
    const first = await computeImageHash(createSnapshot('red'), 100)
    const second = await computeImageHash(createSnapshot('red'), 100)

    expect(first).toBeDefined()
    expect(second).toBe(first)
  })

  it('returns a different hash when the content changes', async () => {
    const red = await computeImageHash(createSnapshot('red'), 100)
    const blue = await computeImageHash(createSnapshot('blue'), 100)

    expect(blue).not.toBe(red)
  })

  // Moved here from trackCanvasCapture.spec.ts: a resize must count as a change even when the
  // downscaled pixels are identical, which is why the canvas dimensions are part of the hash.
  it('returns a different hash when the canvas dimensions change but the downscaled pixels do not', async () => {
    const small = await computeImageHash(createSnapshot('red', 2), 1)
    const large = await computeImageHash(createSnapshot('red', 4), 1)

    expect(large).not.toBe(small)
  })

  it('returns undefined when no 2d context is available', async () => {
    const snapshot = createSnapshot('red')
    spyOn(HTMLCanvasElement.prototype, 'getContext').and.returnValue(null)

    expect(await computeImageHash(snapshot, 100)).toBeUndefined()
  })

  it('falls back to a non-crypto hash when the digest fails', async () => {
    replaceMockable(globalObject.crypto?.subtle, {
      digest: () => Promise.reject(new Error('unsupported')),
    } as unknown as SubtleCrypto)

    const red = await computeImageHash(createSnapshot('red'), 100)
    const sameRed = await computeImageHash(createSnapshot('red'), 100)
    const blue = await computeImageHash(createSnapshot('blue'), 100)

    expect(red).toBeDefined()
    expect(sameRed).toBe(red)
    expect(blue).not.toBe(red)
  })

  // TODO revisit fallback. Moved here from trackCanvasCapture.spec.ts and commented out along with
  // the SubtleCrypto fallback in canvasHash.ts.
  // it('hashes the image when SubtleCrypto is unavailable', async () => {
  //   replaceMockable(globalObject.crypto?.subtle, undefined)
  //
  //   expect(await computeImageHash(createSnapshot('red'), 100)).toBeDefined()
  // })
})

function createSnapshot(color: string, size = 2): CanvasSnapshot {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')!
  context.fillStyle = color
  context.fillRect(0, 0, size, size)
  document.body.appendChild(canvas)
  registerCleanupTask(() => canvas.remove())

  return {
    canvasHeight: size,
    canvasWidth: size,
    close: noop,
    height: size,
    source: canvas,
    width: size,
  }
}
