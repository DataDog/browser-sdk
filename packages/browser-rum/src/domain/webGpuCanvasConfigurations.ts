import type { CanvasPixels } from '@datadog/browser-core'
import { instrumentMethod, isChromium } from '@datadog/browser-core'
import { mockable, noop } from '@datadog/js-core/util'
import type { RumConfiguration } from '@datadog/browser-rum-core'

export interface WebGPUCanvasConfiguration {
  device: GPUDevice
  format: CanvasPixels['format']
  alphaMode: GPUCanvasAlphaMode
}

// GPUTextureUsage flags, which TypeScript doesn't declare
const enum TextureUsage {
  CopySrc = 0x01,
  RenderAttachment = 0x10,
}

const configurations = new WeakMap<HTMLCanvasElement, WebGPUCanvasConfiguration>()

/**
 * Lets WebGPU canvases configured from now on be copied to a buffer, so their frames can be read
 * back without blocking the main thread. This starts with RUM, as apps usually configure their
 * canvases before the recorder is loaded.
 */
export function trackWebGPUCanvasConfigurations(configuration: RumConfiguration) {
  const canvasRecording = configuration.sessionReplayCanvasRecording
  if (
    !canvasRecording?.enable ||
    canvasRecording.maxFramesPerSecond === 0 ||
    typeof GPUCanvasContext === 'undefined' ||
    // Chromium copies the canvas on the GPU, so drawing it is cheaper than reading the texture back
    mockable(isChromium)()
  ) {
    return { stop: noop }
  }

  return instrumentMethod(GPUCanvasContext.prototype, 'configure', ({ target: context, parameters, onPostCall }) => {
    const canvas = context.canvas
    const [gpuConfiguration] = parameters
    if (!(canvas instanceof HTMLCanvasElement)) {
      return
    }
    configurations.delete(canvas)
    const { device, format, alphaMode = 'opaque' } = gpuConfiguration
    if (!isReadableFormat(format)) {
      return
    }

    parameters[0] = {
      ...gpuConfiguration,
      // eslint-disable-next-line no-bitwise
      usage: (gpuConfiguration.usage ?? TextureUsage.RenderAttachment) | TextureUsage.CopySrc,
    }
    onPostCall(() => configurations.set(canvas, { device, format, alphaMode }))
  })
}

export function getWebGPUCanvasConfiguration(canvas: HTMLCanvasElement) {
  return configurations.get(canvas)
}

export function forgetWebGPUCanvasConfiguration(canvas: HTMLCanvasElement) {
  configurations.delete(canvas)
}

// rgba16float canvases are read synchronously instead
function isReadableFormat(format: GPUTextureFormat): format is CanvasPixels['format'] {
  return format === 'bgra8unorm' || format === 'rgba8unorm'
}
