import { clocksNow, Observable, timeStampNow } from '@datadog/browser-core'
import { createNewEvent } from '@datadog/browser-core/test'
import type { Click } from '../src/domain/action/trackClickActions'

export type FakeClick = Readonly<ReturnType<typeof createFakeClick>>

export function createFakeClick({
  hasError = false,
  hasPageActivity = true,
  userActivity,
  event,
}: {
  hasError?: boolean
  hasPageActivity?: boolean
  userActivity?: { selection?: boolean; input?: boolean; scroll?: boolean }
  event?: Partial<PointerEvent & { target: Element }>
} = {}) {
  const stopObservable = new Observable<void>()
  let isStopped = false

  function clone() {
    return createFakeClick({ userActivity, event })
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
    startClocks: clocksNow(),
    hasError,
    hasPageActivity,
    getUserActivity: () => ({
      selection: false,
      input: false,
      scroll: false,
      ...userActivity,
    }),
    addFrustration: jasmine.createSpy<Click['addFrustration']>(),
    clone: jasmine.createSpy<typeof clone>().and.callFake(clone),

    event: createNewEvent('pointerup', {
      clientX: 100,
      clientY: 100,
      timeStamp: timeStampNow(),
      target: document.body,
      ...event,
    }),
  }
}
