import { Observable, timeStampNow } from '@datadog/browser-core'
import { createNewEvent } from '../../core/test/specHelper'

export type FakeClick = ReturnType<typeof createFakeClick>

export function createFakeClick(partialClick?: {
  hasSelectionChanged?: boolean
  event?: Partial<MouseEvent & { target: Element }>
}) {
  const stopObservable = new Observable<void>()
  let isStopped = false

  function clone() {
    return createFakeClick(partialClick)
  }

  return {
    stopObservable,
    isStopped: () => isStopped,
    stop: () => {
      isStopped = true
      stopObservable.notify()
    },
    discard: jasmine.createSpy(),
    validate: jasmine.createSpy(),
    hasError: false,
    hasActivity: true,
    hasSelectionChanged: false,
    addFrustration: jasmine.createSpy(),
    clone: jasmine.createSpy<typeof clone>().and.callFake(clone),

    ...partialClick,
    event: createNewEvent('click', {
      clientX: 100,
      clientY: 100,
      timeStamp: timeStampNow(),
      target: document.body,
      ...partialClick?.event,
    }),
  }
}
