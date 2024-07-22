import type { RumConfiguration, ViewCreatedEvent } from '@datadog/browser-rum-core'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import type { TimeStamp } from '@datadog/browser-core'
import { noop } from '@datadog/browser-core'
import type { BrowserRecord } from '../../types'
import { startFullSnapshots } from './startFullSnapshots'
import { createElementsScrollPositions } from './elementsScrollPositions'
import type { ShadowRootsController } from './shadowRootsController'

describe('startFullSnapshots', () => {
  const viewStartClock = { relative: 1, timeStamp: 1 as TimeStamp }
  let lifeCycle: LifeCycle
  let fullSnapshotCallback: jasmine.Spy<(records: BrowserRecord[]) => void>

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    fullSnapshotCallback = jasmine.createSpy()
    startFullSnapshots(
      createElementsScrollPositions(),
      {} as ShadowRootsController,
      lifeCycle,
      {} as RumConfiguration,
      noop,
      fullSnapshotCallback
    )
  })

  it('takes a full snapshot when startFullSnapshots is called', () => {
    expect(fullSnapshotCallback).toHaveBeenCalledTimes(1)
  })

  it('takes a full snapshot when the view changes', () => {
    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: viewStartClock,
    } as Partial<ViewCreatedEvent> as any)

    expect(fullSnapshotCallback).toHaveBeenCalledTimes(2)
  })

  it('full snapshot related records should have the view change date', () => {
    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: viewStartClock,
    } as Partial<ViewCreatedEvent> as any)

    const records = fullSnapshotCallback.calls.mostRecent().args[0]
    expect(records[0].timestamp).toEqual(1)
    expect(records[1].timestamp).toEqual(1)
    expect(records[2].timestamp).toEqual(1)
  })
})
