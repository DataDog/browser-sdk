import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import type { ViewCreatedEvent } from '@datadog/browser-rum-core'
import type { TimeStamp } from '@datadog/js-core/time'
import { noop } from '@datadog/js-core/util'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import type { MetaRecord } from '../../types'
import { RecordType, SnapshotFormat } from '../../types'
import { appendElement } from '../../../../browser-rum-core/test'
import { startFullSnapshots } from './startFullSnapshots'
import { sanitizeUrl } from './utils/sanitizeUrl'
import type { EmitRecordCallback, EmitStatsCallback } from './record.types'
import { createRecordingScopeForTesting } from './test/recordingScope.specHelper'

describe('startFullSnapshots', () => {
  const viewStartClock = { relative: 1, timeStamp: 1 as TimeStamp }
  let lifeCycle: LifeCycle
  let emitRecordCallback: Mock<EmitRecordCallback>
  let emitStatsCallback: Mock<EmitStatsCallback>

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    emitRecordCallback = vi.fn()
    emitStatsCallback = vi.fn()

    appendElement('<style>body { width: 100%; }</style>', document.head)

    const scope = createRecordingScopeForTesting()
    startFullSnapshots(lifeCycle, emitRecordCallback, emitStatsCallback, noop, scope)
  })

  it('takes a full snapshot when startFullSnapshots is called', () => {
    expect(emitRecordCallback).toHaveBeenCalled()
  })

  it('takes a full snapshot when the view changes', () => {
    emitRecordCallback.mockClear()

    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: viewStartClock,
    } as Partial<ViewCreatedEvent> as any)

    expect(emitRecordCallback).toHaveBeenCalled()
  })

  it('full snapshot related records should have the view change date', () => {
    emitRecordCallback.mockClear()

    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: viewStartClock,
    } as Partial<ViewCreatedEvent> as any)

    const records = emitRecordCallback.mock.calls.map((args) => args[0])
    expect(records[0].timestamp).toEqual(1)
    expect(records[1].timestamp).toEqual(1)
    expect(records[2].timestamp).toEqual(1)
  })

  it('full snapshot records should contain Meta, Focus, FullSnapshot', () => {
    const records = emitRecordCallback.mock.calls.map((args) => args[0])

    expect(records).toEqual(
      expect.arrayContaining([
        {
          data: {
            height: expect.any(Number),
            href: sanitizeUrl(window.location.href),
            width: expect.any(Number),
          },
          type: RecordType.Meta,
          timestamp: expect.any(Number),
        },
        {
          data: {
            has_focus: document.hasFocus(),
          },
          type: RecordType.Focus,
          timestamp: expect.any(Number),
        },
        {
          data: expect.any(Array),
          type: RecordType.FullSnapshot,
          format: SnapshotFormat.Change,
          timestamp: expect.any(Number),
        },
      ])
    )
  })

  it('full snapshot records should contain visualViewport when supported', (ctx) => {
    if (!window.visualViewport) {
      ctx.skip('visualViewport not supported')
    }
    const record = emitRecordCallback.mock.lastCall![0]

    expect(record).toEqual({
      data: expect.any(Object),
      type: RecordType.VisualViewport,
      timestamp: expect.any(Number),
    })
  })

  it('full snapshot records should be emitted with serialization stats', () => {
    expect(emitStatsCallback.mock.lastCall![0]).toEqual({
      cssText: { count: 1, max: 21, sum: 21 },
      serializationDuration: expect.anything(),
    })
  })

  describe('Meta record href', () => {
    it('is the sanitized page URL', () => {
      expect(getMetaRecord().data.href).toBe(sanitizeUrl(window.location.href))
    })

    it('stays an absolute URL, so it can be used as a base URL during playback', () => {
      const { href } = getMetaRecord().data

      expect(href).toBeDefined()
      expect(new URL('relative/path', href).href).toBe(new URL('relative/path', window.location.href).href)
    })

    function getMetaRecord(): MetaRecord {
      const metaRecords = emitRecordCallback.mock.calls
        .map((args) => args[0])
        .filter((record): record is MetaRecord => record.type === RecordType.Meta)
      return metaRecords[metaRecords.length - 1]
    }
  })
})
