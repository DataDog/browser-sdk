import {
  internal_CreationReason as CreationReason,
  internal_IncrementalSource as IncrementalSource,
  internal_RecordType as RecordType,
} from '@datadog/browser-rum-recorder'

import { createTest } from '../lib/framework'
import { browserExecute } from '../lib/helpers/browser'
import { flushEvents } from '../lib/helpers/sdk'

const INTEGER_RE = /^\d+$/
const TIMESTAMP_RE = /^\d{13}$/
const UUID_RE = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/

describe('recorder', () => {
  createTest('record mouse move')
    .withRumRecorder()
    .run(async ({ events }) => {
      await browserExecute(() => {
        return document.documentElement.outerHTML
      })
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
      expect(segment.data.records.find((record) => record.type === RecordType.Meta)).toBeTruthy('have a Meta record')
      expect(segment.data.records.find((record) => record.type === RecordType.FullSnapshot)).toBeTruthy(
        'have a FullSnapshot record'
      )
      expect(
        segment.data.records.find(
          (record) =>
            record.type === RecordType.IncrementalSnapshot && record.data.source === IncrementalSource.MouseInteraction
        )
      ).toBeTruthy('have a IncrementalSnapshot/MouseInteraction record')
    })
})
