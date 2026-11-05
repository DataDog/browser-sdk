import { isChromium } from '@datadog/browser-core'
import { registerCleanupTask, replaceMockable } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '@datadog/browser-rum-core/test'
import { skipIfOffscreenCanvasIsNotSupported } from '../../test'
import { getWebGPUCanvasConfiguration, trackWebGPUCanvasConfigurations } from './webGpuCanvasConfigurations'

const COPY_SRC = 0x01
const TEXTURE_BINDING = 0x04
const RENDER_ATTACHMENT = 0x10

describe('trackWebGPUCanvasConfigurations', () => {
  // Most test browsers have no WebGPU adapter, so the canvas context is faked
  class FakeGPUCanvasContext {
    configuration: GPUCanvasConfiguration | undefined
    constructor(readonly canvas: HTMLCanvasElement | OffscreenCanvas) {}
    configure(configuration: GPUCanvasConfiguration) {
      this.configuration = configuration
    }
  }

  const device = {} as GPUDevice
  let canvas: HTMLCanvasElement
  let context: FakeGPUCanvasContext
  let isChromiumBrowser: boolean

  beforeEach(() => {
    const globals = window as unknown as { GPUCanvasContext: unknown }
    const { GPUCanvasContext } = globals
    globals.GPUCanvasContext = FakeGPUCanvasContext
    registerCleanupTask(() => {
      globals.GPUCanvasContext = GPUCanvasContext
    })

    canvas = document.createElement('canvas')
    context = new FakeGPUCanvasContext(canvas)
    isChromiumBrowser = false
    replaceMockable(isChromium, () => isChromiumBrowser)
  })

  function startTracking(enable = true) {
    const tracker = trackWebGPUCanvasConfigurations(
      mockRumConfiguration({
        sessionReplayCanvasRecording: enable
          ? {
              enable: true,
              maxFramesPerSecond: 1,
              hashingMaxDimension: 100,
              maxImageDimension: 1000,
              encodeQuality: 0.5,
            }
          : undefined,
      })
    )
    registerCleanupTask(() => tracker.stop())
  }

  it('lets the canvas texture be copied, and keeps its configuration', () => {
    startTracking()

    context.configure({ device, format: 'bgra8unorm', usage: RENDER_ATTACHMENT + TEXTURE_BINDING })

    expect(context.configuration!.usage).toBe(RENDER_ATTACHMENT + TEXTURE_BINDING + COPY_SRC)
    expect(getWebGPUCanvasConfiguration(canvas)).toEqual({ device, format: 'bgra8unorm', alphaMode: 'opaque' })
  })

  it('adds the copy usage to the default canvas usage', () => {
    startTracking()

    context.configure({ device, format: 'rgba8unorm', alphaMode: 'premultiplied' })

    expect(context.configuration!.usage).toBe(RENDER_ATTACHMENT + COPY_SRC)
    expect(getWebGPUCanvasConfiguration(canvas)).toEqual({ device, format: 'rgba8unorm', alphaMode: 'premultiplied' })
  })

  it('does not change canvases with a format the worker cannot read', () => {
    startTracking()

    context.configure({ device, format: 'rgba16float' })

    expect(context.configuration!.usage).toBeUndefined()
    expect(getWebGPUCanvasConfiguration(canvas)).toBeUndefined()
  })

  it('forgets the configuration when the canvas is reconfigured with a format the worker cannot read', () => {
    startTracking()

    context.configure({ device, format: 'bgra8unorm' })
    context.configure({ device, format: 'rgba16float' })

    expect(getWebGPUCanvasConfiguration(canvas)).toBeUndefined()
  })

  it('does not change offscreen canvases', () => {
    skipIfOffscreenCanvasIsNotSupported()
    startTracking()
    const offscreenContext = new FakeGPUCanvasContext(new OffscreenCanvas(1, 1))

    offscreenContext.configure({ device, format: 'bgra8unorm' })

    expect(offscreenContext.configuration!.usage).toBeUndefined()
  })

  it('does not change canvases in Chromium, which draws them without waiting for the GPU', () => {
    isChromiumBrowser = true
    startTracking()

    context.configure({ device, format: 'bgra8unorm' })

    expect(context.configuration!.usage).toBeUndefined()
    expect(getWebGPUCanvasConfiguration(canvas)).toBeUndefined()
  })

  it('does not change canvases when canvas recording is disabled', () => {
    startTracking(false)

    context.configure({ device, format: 'bgra8unorm' })

    expect(context.configuration!.usage).toBeUndefined()
    expect(getWebGPUCanvasConfiguration(canvas)).toBeUndefined()
  })
})
