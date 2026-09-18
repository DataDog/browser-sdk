import { ChangeType } from '@datadog/browser-rum/src/types'
import { decodeChangeRecords, findChangeRecords } from '@datadog/browser-rum/test/record/changes'
import { test, expect } from '@playwright/test'
import { createTest, html } from '../../lib/framework'
import { APPLICATION_ID } from '../../lib/helpers/configuration'

const successiveFrameScenarios = [
  { name: '2D', contextType: '2d' },
  { name: 'WebGL 1 with a discarded drawing buffer', contextType: 'webgl', preserveDrawingBuffer: false },
  { name: 'WebGL 1 with a preserved drawing buffer', contextType: 'webgl', preserveDrawingBuffer: true },
  { name: 'WebGL 2 with default context attributes', contextType: 'webgl2' },
] as const
const canvasRecordingQualities = ['low', 'high'] as const

test.describe('recorder canvas resource upload', () => {
  createTest('uploads a canvas resource when a tracked canvas is drawn on')
    .withRum({
      enableExperimentalFeatures: ['session_replay_record_canvas'],
      sessionReplayCanvasRecording: { enable: true, quality: 'low' },
    })
    .withBody(html`<canvas id="canvas" width="10" height="10"></canvas>`)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        const canvas = document.getElementById('canvas') as HTMLCanvasElement
        canvas.getContext('2d')!.fillRect(0, 0, 10, 10)
      })

      // let the canvas capture interval (1 frame/s) elapse so the resource is uploaded
      await page.waitForTimeout(1500)
      await flushEvents()

      expect(intakeRegistry.replayResourceRequests).toHaveLength(1)
      const { hash, image, event } = intakeRegistry.replayResourceRequests[0]
      expect(event).toEqual({ application: { id: APPLICATION_ID }, type: 'resource' })
      expect(hash).toEqual(expect.any(String))
      expect(image.length).toBeGreaterThan(0)

      expect(intakeRegistry.replaySegments).toHaveLength(1)
      const imageContentChanges = decodeChangeRecords(findChangeRecords(intakeRegistry.replaySegments[0].records))
        .flatMap((record) => record.data)
        .filter((change) => change[0] === ChangeType.ImageContent)
        .flatMap((change) => change.slice(1) as Array<[number, string]>)

      expect(imageContentChanges).toHaveLength(1)
      expect(imageContentChanges[0][1]).toBe(hash)
    })

  successiveFrameScenarios.forEach((scenario) => {
    canvasRecordingQualities.forEach((quality) => {
      createTest(`uploads successive ${scenario.name} frames at ${quality} quality`)
        .withRum({
          enableExperimentalFeatures: ['session_replay_record_canvas'],
          sessionReplayCanvasRecording: { enable: true, quality },
        })
        .withBody(html`<canvas id="canvas" width="10" height="10"></canvas>`)
        .run(async ({ intakeRegistry, flushEvents, page }) => {
          const preserveDrawingBuffer = 'preserveDrawingBuffer' in scenario ? scenario.preserveDrawingBuffer : undefined
          const drawFrame = (red: number, blue: number) =>
            page.evaluate(
              async ({
                contextType,
                preserveDrawingBuffer,
                red,
                blue,
              }: {
                contextType: '2d' | 'webgl' | 'webgl2'
                preserveDrawingBuffer?: boolean
                red: number
                blue: number
              }) => {
                const canvas = document.getElementById('canvas') as HTMLCanvasElement
                const attributes: WebGLContextAttributes | undefined =
                  preserveDrawingBuffer === undefined ? undefined : { preserveDrawingBuffer }
                let actualPreserveDrawingBuffer: boolean | undefined

                if (contextType === '2d') {
                  const context = canvas.getContext('2d')!
                  context.fillStyle = `rgb(${red * 255}, 0, ${blue * 255})`
                  context.fillRect(0, 0, canvas.width, canvas.height)
                } else if (contextType === 'webgl') {
                  const context = canvas.getContext('webgl', attributes)!
                  context.clearColor(red, 0, blue, 1)
                  context.clear(context.COLOR_BUFFER_BIT)
                  actualPreserveDrawingBuffer = context.getContextAttributes()?.preserveDrawingBuffer
                } else {
                  const context = canvas.getContext('webgl2', attributes)!
                  context.clearBufferfv(context.COLOR, 0, [red, 0, blue, 1])
                  actualPreserveDrawingBuffer = context.getContextAttributes()?.preserveDrawingBuffer
                }

                await new Promise<void>((resolve) =>
                  requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
                )
                return actualPreserveDrawingBuffer
              },
              { contextType: scenario.contextType, preserveDrawingBuffer, red, blue }
            )

          const actualPreserveDrawingBuffer = await drawFrame(1, 0)
          if (scenario.contextType !== '2d') {
            expect(actualPreserveDrawingBuffer).toBe(preserveDrawingBuffer ?? false)
          }
          await page.waitForTimeout(1500)

          await drawFrame(0, 1)
          await page.waitForTimeout(1500)
          await flushEvents()

          expect(intakeRegistry.replayResourceRequests.length).toBeGreaterThanOrEqual(2)
          const firstResource = intakeRegistry.replayResourceRequests[0]
          const secondResource = intakeRegistry.replayResourceRequests.find(({ hash }) => hash !== firstResource.hash)!

          expect(firstResource.image.length).toBeGreaterThan(0)
          expect(secondResource.image.length).toBeGreaterThan(0)
          expect(secondResource.hash).not.toBe(firstResource.hash)
        })
    })
  })
})
