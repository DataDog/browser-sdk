import type { ViewCreatedEvent } from '@datadog/browser-rum-core'
import type { TimeStamp } from '@datadog/js-core/time'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import { noop } from '@datadog/browser-core'
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
  let emitRecordCallback: jasmine.Spy<EmitRecordCallback>
  let emitStatsCallback: jasmine.Spy<EmitStatsCallback>

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    emitRecordCallback = jasmine.createSpy()
    emitStatsCallback = jasmine.createSpy()

    appendElement('<style>body { width: 100%; }</style>', document.head)

    const scope = createRecordingScopeForTesting()
    startFullSnapshots(lifeCycle, emitRecordCallback, emitStatsCallback, noop, scope)
  })

  it('takes a full snapshot when startFullSnapshots is called', () => {
    expect(emitRecordCallback).toHaveBeenCalled()
  })

  it('takes a full snapshot when the view changes', () => {
    emitRecordCallback.calls.reset()

    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: viewStartClock,
    } as Partial<ViewCreatedEvent> as any)

    expect(emitRecordCallback).toHaveBeenCalled()
  })

  it('full snapshot related records should have the view change date', () => {
    emitRecordCallback.calls.reset()

    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: viewStartClock,
    } as Partial<ViewCreatedEvent> as any)

    const records = emitRecordCallback.calls.allArgs().map((args) => args[0])
    expect(records[0].timestamp).toEqual(1)
    expect(records[1].timestamp).toEqual(1)
    expect(records[2].timestamp).toEqual(1)
  })

  it('full snapshot records should contain Meta, Focus, FullSnapshot', () => {
    const records = emitRecordCallback.calls.allArgs().map((args) => args[0])

    expect(records).toEqual(
      jasmine.arrayContaining([
        {
          data: {
            height: jasmine.any(Number),
            href: sanitizeUrl(window.location.href),
            width: jasmine.any(Number),
          },
          type: RecordType.Meta,
          timestamp: jasmine.any(Number),
        },
        {
          data: {
            has_focus: document.hasFocus(),
          },
          type: RecordType.Focus,
          timestamp: jasmine.any(Number),
        },
        {
          data: jasmine.any(Array),
          type: RecordType.FullSnapshot,
          format: SnapshotFormat.Change,
          timestamp: jasmine.any(Number),
        },
      ])
    )
  })

  it('full snapshot records should contain visualViewport when supported', () => {
    if (!window.visualViewport) {
      pending('visualViewport not supported')
    }
    const record = emitRecordCallback.calls.mostRecent().args[0]

    expect(record).toEqual({
      data: jasmine.any(Object),
      type: RecordType.VisualViewport,
      timestamp: jasmine.any(Number),
    })
  })

  it('full snapshot records should be emitted with serialization stats', () => {
    expect(emitStatsCallback.calls.mostRecent().args[0]).toEqual({
      cssText: { count: 1, max: 21, sum: 21 },
      serializationDuration: jasmine.anything(),
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
      const metaRecords = emitRecordCallback.calls
        .allArgs()
        .map((args) => args[0])
        .filter((record): record is MetaRecord => record.type === RecordType.Meta)
      return metaRecords[metaRecords.length - 1]
    }
  })
})
