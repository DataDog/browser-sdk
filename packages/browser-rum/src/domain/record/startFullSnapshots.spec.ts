import { vi, beforeEach, describe, expect, it, type Mock } from 'vitest'
import type { ViewCreatedEvent } from '@datadog/browser-rum-core'
import type { TimeStamp } from '@datadog/js-core/time'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import { noop } from '@datadog/browser-core'
import { RecordType, SnapshotFormat } from '../../types'
import { appendElement } from '../../../../browser-rum-core/test'
import { startFullSnapshots } from './startFullSnapshots'
import type { EmitRecordCallback, EmitStatsCallback } from './record.types'
import { createRecordingScopeForTesting } from './test/recordingScope.specHelper'

<<<<<<< HEAD
<<<<<<< HEAD
describe('startFullSnapshots', () => {
=======
const describeStartFullSnapshotsWithExpectedSnapshot = (fullSnapshotRecord: BrowserRecord) => {
>>>>>>> 9f695e5f5 (✅ Migrate 257 spec files from Jasmine to Vitest API)
=======
describe('startFullSnapshots', () => {
>>>>>>> 8fed0c958 (🔀 Merge main (resolve 77 conflicts, migrate new code to Vitest))
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
        {
<<<<<<< HEAD
          data: jasmine.any(Array),
          type: RecordType.FullSnapshot,
          format: SnapshotFormat.Change,
          timestamp: jasmine.any(Number),
=======
          data: expect.any(Array),
          type: RecordType.FullSnapshot,
          format: SnapshotFormat.Change,
          timestamp: expect.any(Number),
>>>>>>> 8fed0c958 (🔀 Merge main (resolve 77 conflicts, migrate new code to Vitest))
        },
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
<<<<<<< HEAD
<<<<<<< HEAD
=======
}

describe('startFullSnapshots', () => {
  describe('when generating BrowserFullSnapshotV1Record', () => {
    describeStartFullSnapshotsWithExpectedSnapshot({
      data: {
        node: expect.any(Object),
        initialOffset: {
          left: expect.any(Number),
          top: expect.any(Number),
        },
      },
      format: SnapshotFormat.V1,
      type: RecordType.FullSnapshot,
      timestamp: expect.any(Number),
    })
  })

  describe('when generating BrowserFullSnapshotChangeRecord', () => {
    beforeEach(() => {
      addExperimentalFeatures([ExperimentalFeature.USE_CHANGE_RECORDS])
    })

    describeStartFullSnapshotsWithExpectedSnapshot({
      data: expect.any(Array),
      format: SnapshotFormat.Change,
      type: RecordType.FullSnapshot,
      timestamp: expect.any(Number),
    })
  })
>>>>>>> 9f695e5f5 (✅ Migrate 257 spec files from Jasmine to Vitest API)
=======
>>>>>>> 8fed0c958 (🔀 Merge main (resolve 77 conflicts, migrate new code to Vitest))
})
