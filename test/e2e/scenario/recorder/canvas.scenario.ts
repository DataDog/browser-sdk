import { ChangeType } from '@datadog/browser-rum/src/types'
import { decodeChangeRecords, findChangeRecords } from '@datadog/browser-rum/test/record/changes'
import { test, expect } from '@playwright/test'
import { createTest, html } from '../../lib/framework'
import { APPLICATION_ID } from '../../lib/helpers/configuration'

test.describe('recorder canvas resource upload', () => {
  createTest('uploads a canvas resource when a tracked canvas is drawn on')
    .withRum({
      enableExperimentalFeatures: ['session_replay_record_canvas'],
      sessionReplayCanvasRecording: { enable: true, maxFramesPerSecond: 1 },
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
})
