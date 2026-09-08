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

  it('hashes the image when SubtleCrypto is unavailable', async () => {
    replaceMockable(globalObject.crypto?.subtle, undefined)

    const red = await computeImageHash(createSnapshot('red'), 100)
    const sameRed = await computeImageHash(createSnapshot('red'), 100)
    const blue = await computeImageHash(createSnapshot('blue'), 100)

    expect(red).toBeDefined()
    expect(sameRed).toBe(red)
    expect(blue).not.toBe(red)
  })

  it('hashes the image when the digest fails', async () => {
    replaceMockable(globalObject.crypto?.subtle, {
      digest: () => Promise.reject(new Error('unsupported')),
    } as unknown as SubtleCrypto)

    const red = await computeImageHash(createSnapshot('red'), 100)
    const blue = await computeImageHash(createSnapshot('blue'), 100)

    expect(red).toBeDefined()
    expect(blue).not.toBe(red)
  })
})

function createSnapshot(color: string, size = 2): CanvasSnapshot {
  const source = document.createElement('canvas')
  source.width = size
  source.height = size
  const context = source.getContext('2d')!
  context.fillStyle = color
  context.fillRect(0, 0, size, size)
  document.body.appendChild(source)
  registerCleanupTask(() => source.remove())

  return { canvasHeight: size, canvasWidth: size, source }
}
