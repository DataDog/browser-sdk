import type { ViewCreatedEvent } from '@datadog/browser-rum-core'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import type { TimeStamp } from '@datadog/browser-core'
import { ExperimentalFeature, noop } from '@datadog/browser-core'
import { mockExperimentalFeatures } from '@datadog/browser-core/test'
import type { BrowserRecord } from '../../types'
import { RecordType } from '../../types'
import { appendElement } from '../../../../rum-core/test'
import { startFullSnapshots } from './startFullSnapshots'
import type { EmitRecordCallback, EmitStatsCallback } from './record.types'
import { createRecordingScopeForTesting } from './test/recordingScope.specHelper'

const describeStartFullSnapshotsWithExpectedSnapshot = (fullSnapshotRecord: jasmine.Expected<BrowserRecord>) => {
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
            href: window.location.href,
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
        fullSnapshotRecord,
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
}

describe('startFullSnapshots', () => {
  describe('when generating BrowserFullSnapshotRecord', () => {
    describeStartFullSnapshotsWithExpectedSnapshot({
      data: {
        node: jasmine.any(Object),
        initialOffset: {
          left: jasmine.any(Number),
          top: jasmine.any(Number),
        },
      },
      type: RecordType.FullSnapshot,
      timestamp: jasmine.any(Number),
    })
  })

  describe('when generating BrowserChangeRecord', () => {
    beforeEach(() => {
      mockExperimentalFeatures([ExperimentalFeature.USE_CHANGE_RECORDS])
    })

    describeStartFullSnapshotsWithExpectedSnapshot({
      data: jasmine.any(Array),
      type: RecordType.Change,
      timestamp: jasmine.any(Number),
    })
  })
})
