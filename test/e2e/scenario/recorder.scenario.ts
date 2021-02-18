import { CreationReason, IncrementalSource } from '@datadog/browser-rum-recorder/cjs/types'
import { InputData } from '@datadog/browser-rum-recorder/cjs/domain/rrweb/types'

import { createTest, bundleSetup, html } from '../lib/framework'
import { browserExecute } from '../lib/helpers/browser'
import { flushEvents } from '../lib/helpers/sdk'
import {
  findNodeWithId,
  findFullSnapshot,
  findIncrementalSnapshot,
  findAllIncrementalSnapshots,
  findMeta,
  findTextContent,
} from '../lib/helpers/recorder'

const INTEGER_RE = /^\d+$/
const TIMESTAMP_RE = /^\d{13}$/
const UUID_RE = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/

describe('recorder', () => {
  createTest('record mouse move')
    .withRumRecorder()
    .run(async ({ events }) => {
      await browserExecute(() => document.documentElement.outerHTML)
      const html = await $('html')
      await html.click()
      await flushEvents()

      expect(events.sessionReplay.length).toBe(1)
      const { segment, meta } = events.sessionReplay[0]
      expect(meta).toEqual({
        'application.id': jasmine.stringMatching(UUID_RE),
        creation_reason: 'init',
        end: jasmine.stringMatching(TIMESTAMP_RE),
        has_full_snapshot: 'true',
        records_count: jasmine.stringMatching(INTEGER_RE),
        'session.id': jasmine.stringMatching(UUID_RE),
        start: jasmine.stringMatching(TIMESTAMP_RE),
        'view.id': jasmine.stringMatching(UUID_RE),
      })
      expect(segment).toEqual({
        data: {
          application: { id: meta['application.id'] },
          creation_reason: meta.creation_reason as CreationReason,
          end: Number(meta.end),
          has_full_snapshot: true,
          records: jasmine.any(Array),
          records_count: Number(meta.records_count),
          session: { id: meta['session.id'] },
          start: Number(meta.start),
          view: { id: meta['view.id'] },
        },
        encoding: jasmine.any(String),
        filename: `${meta['session.id']}-${meta.start}`,
        mimetype: 'application/octet-stream',
      })
      expect(findMeta(segment.data)).toBeTruthy('have a Meta record')
      expect(findFullSnapshot(segment.data)).toBeTruthy('have a FullSnapshot record')
      expect(findIncrementalSnapshot(segment.data, IncrementalSource.MouseInteraction)).toBeTruthy(
        'have a IncrementalSnapshot/MouseInteraction record'
      )
    })

  describe('snapshot', () => {
    createTest('obfuscate blocks')
      .withSetup(bundleSetup)
      .withRumRecorder()
      .withBody(
        html`
          <p id="foo">foo</p>
          <p id="bar" data-dd-privacy="hidden">bar</p>
          <p id="baz" class="dd-privacy-hidden baz">baz</p>
        `
      )
      .run(async ({ events }) => {
        await flushEvents()

        expect(events.sessionReplay.length).toBe(1)

        const fullSnapshot = findFullSnapshot(events.sessionReplay[0].segment.data)!

        const fooNode = findNodeWithId(fullSnapshot, 'foo')
        expect(fooNode).toBeTruthy()
        expect(findTextContent(fooNode!)).toBe('foo')

        const barNode = findNodeWithId(fullSnapshot, 'bar')
        expect(barNode).toBeTruthy()
        expect(barNode!.attributes['data-dd-privacy']).toBe('hidden')
        expect(barNode!.childNodes.length).toBe(0)

        const bazNode = findNodeWithId(fullSnapshot, 'baz')
        expect(bazNode).toBeTruthy()
        expect(bazNode!.attributes.class).toBe('dd-privacy-hidden baz')
        expect(bazNode!.attributes['data-dd-privacy']).toBe('hidden')
        expect(bazNode!.childNodes.length).toBe(0)
      })
  })

  describe('input observers', () => {
    createTest('record input when not to be ignored')
      .withSetup(bundleSetup)
      .withRumRecorder()
      .withBody(
        html`
          <input type="text" id="first" name="first" />
          <input type="text" id="second" name="second" data-dd-privacy="input-ignored" />
          <input type="text" id="third" name="third" class="dd-privacy-input-ignored" />
          <input type="password" id="fourth" name="fourth" />
        `
      )
      .run(async ({ events }) => {
        const firstInput = await $('#first')
        await firstInput.setValue('foo')

        const secondInput = await $('#second')
        await secondInput.setValue('bar')

        const thirdInput = await $('#third')
        await thirdInput.setValue('baz')

        const fourthInput = await $('#fourth')
        await fourthInput.setValue('quux')

        await flushEvents()

        expect(events.sessionReplay.length).toBe(1)
        const { segment } = events.sessionReplay[0]

        const inputRecords = findAllIncrementalSnapshots(segment.data, IncrementalSource.Input)

        expect(inputRecords.length).toBeGreaterThanOrEqual(3) // 4 on Safari, 3 on others
        expect((inputRecords[inputRecords.length - 1].data as InputData).text).toBe('foo')
      })
  })
})
