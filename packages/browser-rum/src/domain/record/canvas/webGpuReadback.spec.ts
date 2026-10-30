import type { WebGPUCanvasConfiguration } from '../../webGpuCanvasConfigurations'
import { readWebGPUTexture } from './webGpuReadback'

describe('readWebGPUTexture', () => {
  const texture = { width: 10, height: 2 } as GPUTexture
  let mappedData: ArrayBuffer
  let validationError: GPUError | null
  let buffer: { mapAsync: jasmine.Spy; getMappedRange: jasmine.Spy; destroy: jasmine.Spy }
  let encoder: { copyTextureToBuffer: jasmine.Spy; finish: jasmine.Spy }
  let device: {
    pushErrorScope: jasmine.Spy
    popErrorScope: jasmine.Spy
    createBuffer: jasmine.Spy
    createCommandEncoder: jasmine.Spy
    queue: { submit: jasmine.Spy }
  }

  beforeEach(() => {
    mappedData = new Uint8Array([1, 2, 3, 4]).buffer
    validationError = null
    buffer = {
      mapAsync: jasmine.createSpy().and.callFake(() => Promise.resolve()),
      getMappedRange: jasmine.createSpy().and.callFake(() => mappedData),
      destroy: jasmine.createSpy(),
    }
    encoder = { copyTextureToBuffer: jasmine.createSpy(), finish: jasmine.createSpy().and.returnValue('commands') }
    device = {
      pushErrorScope: jasmine.createSpy(),
      popErrorScope: jasmine.createSpy().and.callFake(() => Promise.resolve(validationError)),
      createBuffer: jasmine.createSpy().and.returnValue(buffer),
      createCommandEncoder: jasmine.createSpy().and.returnValue(encoder),
      queue: { submit: jasmine.createSpy() },
    }
  })

  function read() {
    const configuration: WebGPUCanvasConfiguration = {
      device: device as unknown as GPUDevice,
      format: 'bgra8unorm',
      alphaMode: 'opaque',
    }
    return readWebGPUTexture(texture, configuration, 1000)
  }

  it('copies the texture to a buffer with rows aligned to 256 bytes', async () => {
    await read()

    expect(device.createBuffer).toHaveBeenCalledOnceWith({ size: 256 * 2, usage: jasmine.any(Number) })
    expect(encoder.copyTextureToBuffer).toHaveBeenCalledOnceWith(
      { texture },
      { buffer, bytesPerRow: 256 },
      { width: 10, height: 2 }
    )
    expect(device.queue.submit).toHaveBeenCalledOnceWith(['commands'])
  })

  it('resolves with a copy of the mapped pixels', async () => {
    const pixels = await read()

    expect(pixels).toEqual({
      data: jasmine.any(ArrayBuffer),
      width: 10,
      height: 2,
      bytesPerRow: 256,
      format: 'bgra8unorm',
      alphaMode: 'opaque',
      maxImageDimension: 1000,
    })
    expect(pixels.data).not.toBe(mappedData)
    expect(Array.from(new Uint8Array(pixels.data))).toEqual([1, 2, 3, 4])
    expect(buffer.destroy).toHaveBeenCalled()
  })

  it('catches its own validation errors and rejects', async () => {
    validationError = { message: 'invalid copy' }

    await expectAsync(read()).toBeRejectedWithError('invalid copy')
    expect(device.pushErrorScope).toHaveBeenCalledOnceWith('validation')
    expect(device.popErrorScope).toHaveBeenCalledTimes(1)
    expect(buffer.destroy).toHaveBeenCalled()
  })

  it('rejects when the buffer cannot be mapped', async () => {
    buffer.mapAsync.and.callFake(() => Promise.reject(new DOMException('device lost', 'OperationError')))

    await expectAsync(read()).toBeRejected()
    expect(buffer.destroy).toHaveBeenCalled()
  })
})
