import { test, expect } from '@playwright/test'
import { createTest, html } from '../../lib/framework'

// Since there is no requests being send we just mock by using a probe.
// This will be removed in future PRs.

declare global {
  interface Window {
    canvasDirtyProbe: {
      dirtyCanvases?: Set<HTMLCanvasElement>
      dirtyCalls: string[]
      originalFillRect: CanvasRenderingContext2D['fillRect']
    }
  }
}

const CANVAS_DIRTY_PROBE = html`
  <script>
    ;(() => {
      // Observe the private dirty-canvas set to verify when the recorder marks a canvas dirty.
      const originalAdd = Set.prototype.add
      const dirtyCalls = []

      window.canvasDirtyProbe = {
        dirtyCalls,
        originalFillRect: CanvasRenderingContext2D.prototype.fillRect,
      }

      Set.prototype.add = function (value) {
        if (value instanceof HTMLCanvasElement) {
          window.canvasDirtyProbe.dirtyCanvases = this
          dirtyCalls.push(value.id)
        }

        return originalAdd.call(this, value)
      }
    })()
  </script>
`

test.describe('canvas recording', () => {
  createTest('tracks dirty canvases')
    .withHead(CANVAS_DIRTY_PROBE)
    .withRum({
      enableExperimentalFeatures: ['session_replay_record_canvas'],
      sessionReplayCanvasRecording: { enable: true, maxFramesPerSecond: 1 },
    })
    .run(async ({ page }) => {
      // Wait until the recorder instruments the 2D drawing API.
      await expect
        .poll(() =>
          page.evaluate(() => CanvasRenderingContext2D.prototype.fillRect !== window.canvasDirtyProbe.originalFillRect)
        )
        .toBe(true)

      // Newly inserted canvases are dirty and must be considered for capture.
      await page.evaluate(() => {
        for (const id of ['drawn', 'resized', 'unchanged']) {
          const canvas = document.createElement('canvas')
          canvas.id = id
          canvas.width = 100
          canvas.height = 100
          document.body.appendChild(canvas)
        }
      })

      await expect
        .poll(() =>
          page.evaluate(() => {
            const dirtyCanvases = window.canvasDirtyProbe.dirtyCanvases
            return {
              dirtyCalls: [...window.canvasDirtyProbe.dirtyCalls].sort(),
              dirtyStates: dirtyCanvases
                ? ['drawn', 'resized', 'unchanged'].map((id) =>
                    dirtyCanvases.has(document.querySelector<HTMLCanvasElement>(`#${id}`)!)
                  )
                : undefined,
            }
          })
        )
        .toEqual({
          dirtyCalls: ['drawn', 'resized', 'unchanged'],
          dirtyStates: [true, true, true],
        })

      // Establish a clean state, then exercise the real canvas drawing and DOM APIs.
      await page.evaluate(() => {
        const probe = window.canvasDirtyProbe
        const canvases = document.querySelectorAll('canvas')

        canvases.forEach((canvas) => probe.dirtyCanvases!.delete(canvas))
        probe.dirtyCalls.length = 0

        document.querySelector<HTMLCanvasElement>('#drawn')!.getContext('2d')!.fillRect(0, 0, 10, 10)
        document.querySelector<HTMLCanvasElement>('#resized')!.toggleAttribute('width')
        document.querySelector<HTMLCanvasElement>('#unchanged')!.getContext('2d')!.beginPath()
      })

      // Drawing and resizing make canvases dirty; beginPath() does not change the canvas bitmap.
      await expect
        .poll(() => page.evaluate(() => [...window.canvasDirtyProbe.dirtyCalls].sort()))
        .toEqual(['drawn', 'resized'])

      expect(
        await page.evaluate(() => {
          const dirtyCanvases = window.canvasDirtyProbe.dirtyCanvases!
          return ['drawn', 'resized', 'unchanged'].map((id) =>
            dirtyCanvases.has(document.querySelector<HTMLCanvasElement>(`#${id}`)!)
          )
        })
      ).toEqual([true, true, false])
    })

  createTest('seeds canvases rendered before recording starts')
    .withHead(CANVAS_DIRTY_PROBE)
    .withBody(html`
      <canvas id="pre-rendered" width="100" height="100"></canvas>
      <script>
        const canvas = document.querySelector('#pre-rendered')
        canvas.getContext('2d').fillRect(0, 0, 10, 10)
      </script>
    `)
    .withRum({
      enableExperimentalFeatures: ['session_replay_record_canvas'],
      sessionReplayCanvasRecording: { enable: true, maxFramesPerSecond: 1 },
      startSessionReplayRecordingManually: true,
    })
    .run(async ({ page }) => {
      await page.evaluate(() => window.DD_RUM!.startSessionReplayRecording())

      await expect
        .poll(() => page.evaluate(() => window.canvasDirtyProbe.dirtyCalls))
        .toContain('pre-rendered')
    })
})
