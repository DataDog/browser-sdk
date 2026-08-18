import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createTest, html } from '../../lib/framework'

// Canvas images are not sent to the intake yet. Observe the browser APIs used by the capture pipeline
// so the test can exercise real hashing and encoding without depending on private recorder state.
declare global {
  interface Window {
    canvasCaptureProbe: {
      captures: Array<{
        blobSize: number | undefined
        blobType: string | undefined
        height: number
        requestedType: string | undefined
        width: number
      }>
      canvasReadIds: string[]
      hashCallCount: number
      hashDimensions: Array<{ height: number; width: number }>
      originalFillRect: CanvasRenderingContext2D['fillRect']
      toBlobCallIds: string[]
    }
  }
}

const CANVAS_CAPTURE_PROBE = html`
  <script>
    ;(() => {
      const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData
      const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage
      const originalToBlob = HTMLCanvasElement.prototype.toBlob

      window.canvasCaptureProbe = {
        captures: [],
        canvasReadIds: [],
        hashCallCount: 0,
        hashDimensions: [],
        originalFillRect: CanvasRenderingContext2D.prototype.fillRect,
        toBlobCallIds: [],
      }

      CanvasRenderingContext2D.prototype.drawImage = function (source, ...args) {
        if (source instanceof HTMLCanvasElement && source.id) {
          window.canvasCaptureProbe.canvasReadIds.push(source.id)
        }
        return originalDrawImage.call(this, source, ...args)
      }

      CanvasRenderingContext2D.prototype.getImageData = function (...args) {
        window.canvasCaptureProbe.hashCallCount += 1
        window.canvasCaptureProbe.hashDimensions.push({ height: args[3], width: args[2] })
        return originalGetImageData.apply(this, args)
      }

      HTMLCanvasElement.prototype.toBlob = function (callback, requestedType, quality) {
        const canvas = this
        if (canvas.id) {
          window.canvasCaptureProbe.toBlobCallIds.push(canvas.id)
        }
        return originalToBlob.call(
          canvas,
          (blob) => {
            window.canvasCaptureProbe.captures.push({
              blobSize: blob?.size,
              blobType: blob?.type,
              height: canvas.height,
              requestedType,
              width: canvas.width,
            })
            callback(blob)
          },
          requestedType,
          quality
        )
      }
    })()
  </script>
`

test.describe('canvas recording', () => {
  createTest('captures changed canvas images and skips unchanged images')
    .withHead(CANVAS_CAPTURE_PROBE)
    .withRum({
      enableExperimentalFeatures: ['session_replay_record_canvas'],
      sessionReplayCanvasRecording: {
        enable: true,
        imageFormat: 'image/png',
        maxCaptureDimension: 50,
        maxFramesPerSecond: 5,
        maxHashDimension: 20,
      },
    })
    .run(async ({ page }) => {
      await expect
        .poll(() =>
          page.evaluate(
            () => CanvasRenderingContext2D.prototype.fillRect !== window.canvasCaptureProbe.originalFillRect
          )
        )
        .toBe(true)

      await page.evaluate(() => {
        const canvas = document.createElement('canvas')
        canvas.id = 'recorded-canvas'
        canvas.width = 200
        canvas.height = 100
        document.body.appendChild(canvas)

        const context = canvas.getContext('2d')!
        context.fillStyle = 'red'
        context.fillRect(0, 0, canvas.width, canvas.height)
      })

      await expect.poll(() => getCanvasCaptures(page)).toHaveLength(1)

      const [firstCapture] = await getCanvasCaptures(page)
      expect(firstCapture).toEqual({
        blobSize: expect.any(Number),
        blobType: 'image/png',
        height: 25,
        requestedType: 'image/png',
        width: 50,
      })
      expect(firstCapture.blobSize).toBeGreaterThan(0)
      expect(await page.evaluate(() => window.canvasCaptureProbe.hashDimensions[0])).toEqual({
        height: 10,
        width: 20,
      })

      const firstHashCallCount = await page.evaluate(() => window.canvasCaptureProbe.hashCallCount)

      // The drawing API marks the canvas dirty, but painting the same pixels should not encode another blob.
      await page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('#recorded-canvas')!
        const context = canvas.getContext('2d')!
        context.fillStyle = 'red'
        context.fillRect(0, 0, canvas.width, canvas.height)
      })

      await expect
        .poll(() => page.evaluate(() => window.canvasCaptureProbe.hashCallCount))
        .toBeGreaterThan(firstHashCallCount)
      expect(await getCanvasCaptures(page)).toHaveLength(1)

      await page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('#recorded-canvas')!
        const context = canvas.getContext('2d')!
        context.fillStyle = 'blue'
        context.fillRect(0, 0, canvas.width, canvas.height)
      })

      await expect.poll(() => getCanvasCaptures(page)).toHaveLength(2)

      const secondCapture = (await getCanvasCaptures(page))[1]
      expect(secondCapture).toMatchObject({
        blobType: 'image/png',
        height: 25,
        requestedType: 'image/png',
        width: 50,
      })
      expect(secondCapture.blobSize).toBeGreaterThan(0)
    })

  createTest('respects canvas privacy and captures privacy transitions')
    .withHead(CANVAS_CAPTURE_PROBE)
    .withRum({
      defaultPrivacyLevel: 'mask',
      enableExperimentalFeatures: ['session_replay_record_canvas'],
      sessionReplayCanvasRecording: {
        enable: true,
        imageFormat: 'image/png',
        maxCaptureDimension: 1000,
        maxFramesPerSecond: 5,
        maxHashDimension: 20,
      },
    })
    .run(async ({ page }) => {
      await page.evaluate(() => {
        const appendCanvas = (id: string, parent: Element, privacy?: string) => {
          const canvas = document.createElement('canvas')
          canvas.id = id
          canvas.width = 10
          canvas.height = 10
          if (privacy) {
            canvas.setAttribute('data-dd-privacy', privacy)
          }
          parent.appendChild(canvas)
          canvas.getContext('2d')!.fillRect(0, 0, 10, 10)
        }
        const appendPrivateParent = (privacy: string) => {
          const parent = document.createElement('div')
          parent.setAttribute('data-dd-privacy', privacy)
          document.body.appendChild(parent)
          return parent
        }

        appendCanvas('default-mask', document.body)
        appendCanvas('masked', appendPrivateParent('mask'))
        appendCanvas('mask-unless-allowlisted', appendPrivateParent('mask-unless-allowlisted'))
        appendCanvas('hidden', appendPrivateParent('hidden'), 'allow')

        const ignoredParent = document.createElement('script')
        document.body.appendChild(ignoredParent)
        appendCanvas('ignored', ignoredParent)

        appendCanvas('allowed-under-mask', appendPrivateParent('mask'), 'allow')
        appendCanvas('mask-user-input', appendPrivateParent('mask-user-input'))
      })

      // Only ALLOW and MASK_USER_INPUT canvases may reach either pixel hashing or blob encoding.
      await expect.poll(() => page.evaluate(() => window.canvasCaptureProbe.toBlobCallIds.length)).toBe(2)
      expect(await page.evaluate(() => [...window.canvasCaptureProbe.canvasReadIds].sort())).toEqual([
        'allowed-under-mask',
        'mask-user-input',
      ])
      expect(await page.evaluate(() => [...window.canvasCaptureProbe.toBlobCallIds].sort())).toEqual([
        'allowed-under-mask',
        'mask-user-input',
      ])

      // Changing an ancestor from masked to allowed must dirty and capture its descendant canvas.
      await page.evaluate(() => {
        document.querySelector('#masked')!.parentElement!.setAttribute('data-dd-privacy', 'allow')
      })
      await expect.poll(() => page.evaluate(() => window.canvasCaptureProbe.toBlobCallIds.length)).toBe(3)
      expect(await page.evaluate(() => window.canvasCaptureProbe.toBlobCallIds)).toContain('masked')

      // Let the private tick clear the previous hash before allowing the same unchanged pixels again.
      await page.evaluate(() => {
        document.querySelector('#allowed-under-mask')!.setAttribute('data-dd-privacy', 'mask')
      })
      await page.waitForTimeout(250)
      await page.evaluate(() => {
        document.querySelector('#allowed-under-mask')!.setAttribute('data-dd-privacy', 'allow')
      })
      await expect.poll(() => page.evaluate(() => window.canvasCaptureProbe.toBlobCallIds.length)).toBe(4)
      expect(
        await page.evaluate(
          () => window.canvasCaptureProbe.toBlobCallIds.filter((id) => id === 'allowed-under-mask').length
        )
      ).toBe(2)
    })

  createTest('captures unchanged canvases after a subsequent full snapshot')
    .withHead(CANVAS_CAPTURE_PROBE)
    .withRum({
      enableExperimentalFeatures: ['session_replay_record_canvas'],
      sessionReplayCanvasRecording: {
        enable: true,
        imageFormat: 'image/png',
        maxCaptureDimension: 1000,
        maxFramesPerSecond: 5,
        maxHashDimension: 20,
      },
    })
    .run(async ({ page }) => {
      await page.evaluate(() => {
        const canvas = document.createElement('canvas')
        canvas.id = 'full-snapshot-canvas'
        document.body.appendChild(canvas)
        canvas.getContext('2d')!.fillRect(0, 0, 10, 10)
      })
      await expect.poll(() => getCanvasCaptures(page)).toHaveLength(1)

      // A new full snapshot creates a new node identity, so unchanged pixels need a new association.
      await page.evaluate(() => window.DD_RUM!.startView())

      await expect.poll(() => getCanvasCaptures(page)).toHaveLength(2)
      expect(await page.evaluate(() => window.canvasCaptureProbe.toBlobCallIds)).toEqual([
        'full-snapshot-canvas',
        'full-snapshot-canvas',
      ])
    })
})

function getCanvasCaptures(page: Page) {
  return page.evaluate(() => window.canvasCaptureProbe.captures)
}
