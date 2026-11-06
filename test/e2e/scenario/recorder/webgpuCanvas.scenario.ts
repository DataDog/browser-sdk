import { test, expect } from '@playwright/test'
import { createTest, html } from '../../lib/framework'
import { readImagePixel } from './canvasImage'

// Only Chromium exposes a WebGPU adapter in our Linux CI image, through SwiftShader.
test.skip(() => test.info().project.name !== 'chromium', 'WebGPU is tested on chromium only')

test.use({
  launchOptions: {
    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-angle=swiftshader'],
  },
})

test.describe('recorder WebGPU canvas resource upload', () => {
  createTest('uploads a webgpu canvas resource')
    .withRum({
      enableExperimentalFeatures: ['session_replay_record_canvas'],
      sessionReplayCanvasRecording: { enable: true, quality: 'low' },
    })
    .withBody(html`<canvas id="canvas" width="10" height="10"></canvas>`)
    // WebGPU is only exposed in secure contexts
    .withHostName('localhost')
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      // Chrome discards the canvas texture once the frame is presented, so a blank upload means the
      // recorder read the canvas too late.
      await page.evaluate(drawWebGPUCanvas)

      await expect.poll(() => intakeRegistry.replayResourceRequests.length).toBe(1)
      await flushEvents()

      expect(intakeRegistry.replayResourceRequests).toHaveLength(1)
      const pixel = await page.evaluate(
        readImagePixel,
        intakeRegistry.replayResourceRequests[0].image.toString('base64')
      )

      // The canvas is cleared to opaque red. WebP compression can slightly change RGB values.
      expect(pixel[0]).toBeGreaterThan(240) // Red
      expect(pixel[1]).toBeLessThan(15) // Green
      expect(pixel[2]).toBeLessThan(15) // Blue
      expect(pixel[3]).toBe(255) // Alpha: fully opaque
    })
})

async function drawWebGPUCanvas() {
  const adapter = await navigator.gpu.requestAdapter()
  const device = await adapter!.requestDevice()
  const context = (document.getElementById('canvas') as HTMLCanvasElement).getContext('webgpu') as GPUCanvasContext
  context.configure({ device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: 'opaque' })

  const encoder = device.createCommandEncoder()
  encoder
    .beginRenderPass({
      colorAttachments: [
        { view: context.getCurrentTexture().createView(), clearValue: [1, 0, 0, 1], loadOp: 'clear', storeOp: 'store' },
      ],
    })
    .end()
  device.queue.submit([encoder.finish()])
}
