import { ChangeType } from '@datadog/browser-rum/src/types'
import { decodeChangeRecords, findChangeRecords } from '@datadog/browser-rum/test/record/changes'
import { test, expect } from '@playwright/test'
import { createTest, html } from '../../lib/framework'
import { APPLICATION_ID } from '../../lib/helpers/configuration'

test.describe('recorder canvas resource upload', () => {
  // With preserveDrawingBuffer disabled, the recorder must capture WebGL pixels before the browser clears them.
  for (const { contextType, preserveDrawingBuffer } of [
    { contextType: '2d', preserveDrawingBuffer: undefined },
    { contextType: 'webgl', preserveDrawingBuffer: false },
    { contextType: 'webgl', preserveDrawingBuffer: true },
    { contextType: 'webgl2', preserveDrawingBuffer: false },
    { contextType: 'webgl2', preserveDrawingBuffer: true },
  ] as const) {
    createTest(`uploads a ${contextType} canvas resource (preserveDrawingBuffer: ${preserveDrawingBuffer})`)
      .withRum({
        enableExperimentalFeatures: ['session_replay_record_canvas'],
        sessionReplayCanvasRecording: { enable: true, quality: 'low' },
      })
      .withBody(html`<canvas id="canvas" width="10" height="10"></canvas>`)
      .run(async ({ intakeRegistry, flushEvents, page, browserName }) => {
        await page.evaluate(drawCanvas, { contextType, preserveDrawingBuffer })

        await expect.poll(() => intakeRegistry.replayResourceRequests.length).toBe(1)
        if (browserName === 'webkit') {
          // WebKit may omit beforeunload during navigation, so trigger the SDK's flush listener before flushEvents().
          await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')))
        }
        await flushEvents()

        expect(intakeRegistry.replayResourceRequests).toHaveLength(1)
        const { hash, image, event } = intakeRegistry.replayResourceRequests[0]
        expect(event).toEqual({ application: { id: APPLICATION_ID }, type: 'resource' })
        expect(hash).toEqual(expect.any(String))
        const pixel = await page.evaluate(readImagePixel, image.toString('base64'))

        // Every context draws opaque red: RGBA [255, 0, 0, 255]. WebP compression can slightly change RGB values.
        // Check the uploaded pixels so a blank capture (e.g. a cleared WebGL buffer) cannot pass on upload alone.
        expect(pixel[0]).toBeGreaterThan(240) // Red
        expect(pixel[1]).toBeLessThan(15) // Green
        expect(pixel[2]).toBeLessThan(15) // Blue
        expect(pixel[3]).toBe(255) // Alpha: fully opaque

        expect(intakeRegistry.replaySegments).toHaveLength(1)
        const imageContentChanges = decodeChangeRecords(findChangeRecords(intakeRegistry.replaySegments[0].records))
          .flatMap((record) => record.data)
          .filter((change) => change[0] === ChangeType.ImageContent)
          .flatMap((change) => change.slice(1) as Array<[number, string]>)

        expect(imageContentChanges).toHaveLength(1)
        // The replay record must reference the same image resource that was uploaded.
        expect(imageContentChanges[0][1]).toBe(hash)
      })
  }
})

function drawCanvas({
  contextType,
  preserveDrawingBuffer,
}: {
  contextType: '2d' | 'webgl' | 'webgl2'
  preserveDrawingBuffer?: boolean
}) {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement
  if (contextType === '2d') {
    const context = canvas.getContext('2d')!
    context.fillStyle = 'red'
    context.fillRect(0, 0, 10, 10)
  } else if (contextType === 'webgl') {
    const context = canvas.getContext('webgl', { preserveDrawingBuffer })!
    context.clearColor(1, 0, 0, 1)
    context.clear(context.COLOR_BUFFER_BIT)
  } else {
    const context = canvas.getContext('webgl2', { preserveDrawingBuffer })!
    // Exercise a WebGL2-specific drawing method to verify its instrumentation.
    context.clearBufferfv(context.COLOR, 0, new Float32Array([1, 0, 0, 1]))
  }
}

// Decode the uploaded image onto a detached canvas and return its center pixel as [red, green, blue, alpha].
// Reading the uploaded bytes verifies the recorder's output, rather than just the original canvas drawing.
async function readImagePixel(base64Image: string) {
  const image = new Image()
  image.src = `data:image/webp;base64,${base64Image}`
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')!
  context.drawImage(image, 0, 0)
  return Array.from(context.getImageData(5, 5, 1, 1).data)
}
