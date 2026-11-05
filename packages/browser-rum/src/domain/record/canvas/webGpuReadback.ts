import type { CanvasPixels } from '@datadog/browser-core'
import type { WebGPUCanvasConfiguration } from '../../webGpuCanvasConfigurations'

// GPUBufferUsage and GPUMapMode flags, which TypeScript doesn't declare
const enum BufferUsage {
  MapRead = 0x01,
  CopyDst = 0x08,
}
const MAP_MODE_READ = 0x01

/**
 * Copies a WebGPU canvas texture to a buffer, and resolves with its pixels once the GPU is done.
 * Unlike drawing the canvas, this doesn't make the main thread wait for the GPU. Rejects if the
 * texture can't be copied.
 */
export function readWebGPUTexture(
  texture: GPUTexture,
  { device, format, alphaMode }: WebGPUCanvasConfiguration,
  maxImageDimension: number
): Promise<CanvasPixels> {
  const { width, height } = texture
  const bytesPerRow = Math.ceil((width * 4) / 256) * 256

  // Our errors must not reach the app's uncapturederror listeners
  device.pushErrorScope('validation')
  // ponytail: full-resolution copy (8 MB for 1080p), a GPU downscale first would cut it 3.6x
  const buffer = device.createBuffer({
    size: bytesPerRow * height,
    // eslint-disable-next-line no-bitwise
    usage: BufferUsage.CopyDst | BufferUsage.MapRead,
  })
  const encoder = device.createCommandEncoder()
  encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow }, { width, height })
  device.queue.submit([encoder.finish()])
  const validationError = device.popErrorScope()

  return Promise.all([validationError, buffer.mapAsync(MAP_MODE_READ)])
    .then(([error]) => {
      if (error) {
        throw new Error(error.message)
      }
      // The mapped range can't be transferred to the worker, so it is copied
      return {
        data: buffer.getMappedRange().slice(0),
        width,
        height,
        bytesPerRow,
        format,
        alphaMode,
        maxImageDimension,
      }
    })
    .finally(() => buffer.destroy())
}
