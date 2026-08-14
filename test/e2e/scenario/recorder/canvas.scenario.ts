import { wait } from '@datadog/browser-core/test/wait'
import type { Page } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { createTest, html } from '../../lib/framework'

// TODO: Replace this browser API instrumentation with an intake assertion when canvas resources are uploaded.
const CANVAS_CAPTURE_INSTRUMENTATION = html`
  <script>
    window.__canvasCaptureTest = {
      toBlobCallCount: 0,
      capturedImageCount: 0,
      imageTypes: [],
      allImagesHaveBytes: true,
    }

    const originalToBlob = HTMLCanvasElement.prototype.toBlob
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      window.__canvasCaptureTest.toBlobCallCount += 1
      const captureStatus = document.querySelector('#capture-status')
      if (captureStatus) {
        captureStatus.textContent = 'Canvas captures: ' + window.__canvasCaptureTest.toBlobCallCount
      }
      return originalToBlob.call(
        this,
        (blob) => {
          window.__canvasCaptureTest.capturedImageCount += 1
          window.__canvasCaptureTest.imageTypes.push(blob && blob.type)
          window.__canvasCaptureTest.allImagesHaveBytes =
            window.__canvasCaptureTest.allImagesHaveBytes && Boolean(blob && blob.size > 0)
          callback(blob)
        },
        type,
        quality
      )
    }
  </script>
`

test.describe('canvas recorder', () => {
  createTest('captures dirty canvases periodically')
    .withHead(CANVAS_CAPTURE_INSTRUMENTATION)
    .withBody(html`
      <style>
        body {
          margin: 0;
          min-height: 100vh;
          display: grid;
          place-content: center;
          gap: 16px;
          background: #f5f3ff;
          font-family: sans-serif;
        }

        canvas {
          width: 800px;
          height: 450px;
          border: 4px solid #632ca6;
          border-radius: 16px;
          box-shadow: 0 20px 50px rgb(45 25 85 / 25%);
        }

        #capture-status {
          font-size: 24px;
          font-weight: 600;
          color: #42166f;
        }
      </style>
      <output id="capture-status">Canvas captures: 0</output>
      <canvas width="800" height="450"></canvas>
    `)
    .withRum({
      enableExperimentalFeatures: ['record_canvas'],
      recordCanvas: true,
      canvasMaxFramesPerSecond: 5,
    })
    .run(async ({ page }) => {
      await page.evaluate(() => {
        const canvas = document.querySelector('canvas')!
        const context = canvas.getContext('2d')!

        const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height)
        gradient.addColorStop(0, '#632ca6')
        gradient.addColorStop(1, '#ff4f8b')
        context.fillStyle = gradient
        context.fillRect(0, 0, canvas.width, canvas.height)

        context.fillStyle = 'white'
        context.font = 'bold 56px sans-serif'
        context.fillText('Session Replay Canvas', 70, 210)
        context.font = '32px sans-serif'
        context.fillText('Dirty frame 1', 70, 270)
      })

      await expect
        .poll(() => getCanvasCaptureState(page))
        .toEqual({
          toBlobCallCount: 1,
          capturedImageCount: 1,
          imageTypes: ['image/png'],
          allImagesHaveBytes: true,
        })
      await expect(page.locator('#capture-status')).toHaveText('Canvas captures: 1')

      await wait(500)
      expect(await getCanvasCaptureState(page)).toEqual({
        toBlobCallCount: 1,
        capturedImageCount: 1,
        imageTypes: ['image/png'],
        allImagesHaveBytes: true,
      })

      await page.evaluate(() => {
        const canvas = document.querySelector('canvas')!
        canvas.setAttribute('width', '900')

        const context = canvas.getContext('2d')!
        context.fillStyle = '#111827'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.fillStyle = '#67e8f9'
        context.font = 'bold 64px sans-serif'
        context.fillText('Canvas resized and redrawn', 55, 235)
      })

      await expect
        .poll(() => getCanvasCaptureState(page))
        .toEqual({
          toBlobCallCount: 2,
          capturedImageCount: 2,
          imageTypes: ['image/png', 'image/png'],
          allImagesHaveBytes: true,
        })
      await expect(page.locator('#capture-status')).toHaveText('Canvas captures: 2')
    })
})

function getCanvasCaptureState(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __canvasCaptureTest: {
            toBlobCallCount: number
            capturedImageCount: number
            imageTypes: string[]
            allImagesHaveBytes: boolean
          }
        }
      ).__canvasCaptureTest
  )
}
