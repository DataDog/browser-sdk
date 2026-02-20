import { vi, beforeEach, describe, expect, it, type Mock } from 'vitest'
import type { ViewCreatedEvent } from '@datadog/browser-rum-core'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import type { TimeStamp } from '@datadog/browser-core'
import { addExperimentalFeatures, ExperimentalFeature, noop } from '@datadog/browser-core'
import type { BrowserRecord } from '../../types'
import { RecordType } from '../../types'
import { appendElement } from '../../../../rum-core/test'
import { startFullSnapshots } from './startFullSnapshots'
import type { EmitRecordCallback, EmitStatsCallback } from './record.types'
import { createRecordingScopeForTesting } from './test/recordingScope.specHelper'

const describeStartFullSnapshotsWithExpectedSnapshot = (fullSnapshotRecord: BrowserRecord) => {
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
            href: window.location.href,
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
        fullSnapshotRecord,
      ])
    )
  })

  it('full snapshot records should contain visualViewport when supported', (ctx) => {
    if (!window.visualViewport) {
      ctx.skip()
      return
    }
    const record = emitRecordCallback.mock.lastCall![0]

    expect(record).toEqual({
      data: expect.any(Object),
      type: RecordType.VisualViewport,
      timestamp: expect.any(Number),
    })
  })

  it('full snapshot records should be emitted with serialization stats', () => {
    const stats = emitStatsCallback.mock.lastCall![0]
    // In browser mode, the document may contain framework-injected styles.
    // Verify that at least the test's stylesheet was counted.
    expect(stats.cssText.count).toBeGreaterThanOrEqual(1)
    expect(stats.cssText.max).toBeGreaterThanOrEqual(21)
    expect(stats.cssText.sum).toBeGreaterThanOrEqual(21)
    expect(stats.serializationDuration).toBeDefined()
  })
}

describe('startFullSnapshots', () => {
  describe('when generating BrowserFullSnapshotRecord', () => {
    describeStartFullSnapshotsWithExpectedSnapshot({
      data: {
        node: expect.any(Object),
        initialOffset: {
          left: expect.any(Number),
          top: expect.any(Number),
        },
      },
      type: RecordType.FullSnapshot,
      timestamp: expect.any(Number),
    })
  })

  describe('when generating BrowserChangeRecord', () => {
    beforeEach(() => {
      addExperimentalFeatures([ExperimentalFeature.USE_CHANGE_RECORDS])
    })

    describeStartFullSnapshotsWithExpectedSnapshot({
      data: expect.any(Array),
      type: RecordType.Change,
      timestamp: expect.any(Number),
    })
  })
})
