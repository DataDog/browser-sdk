import { clocksNow, timeStampNow } from '@datadog/js-core/time'
import { Observable } from '@datadog/browser-core'
import { createNewEvent } from '@datadog/browser-core/test'
import type { Click } from '../src/domain/action/trackClickActions'
import type { FrustrationIgnore } from '../src/domain/action/frustrationIgnore'
import { getFrustrationIgnore } from '../src/domain/action/frustrationIgnore'
import type { MouseEventOnElement, UserActivity } from '../src/domain/action/listenActionEvents'

export type FakeClick = Readonly<ReturnType<typeof createFakeClick>>

export function createFakeClick({
  hasError = false,
  hasPageActivity = true,
  userActivity,
  event,
  frustrationIgnore,
}: {
  hasError?: boolean
  hasPageActivity?: boolean
  userActivity?: Partial<UserActivity>
  event?: Partial<MouseEventOnElement>
  frustrationIgnore?: FrustrationIgnore
} = {}) {
  const stopObservable = new Observable<void>()
  let isStopped = false
  const capturedFrustrationIgnore = frustrationIgnore ?? getFrustrationIgnore(event?.target ?? document.body)

  function clone() {
    return createFakeClick({ userActivity, event, frustrationIgnore: capturedFrustrationIgnore })
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
    ignore: capturedFrustrationIgnore,

    event: createNewEvent('pointerup', {
      clientX: 100,
      clientY: 100,
      timeStamp: timeStampNow(),
      target: document.body,
      ...event,
    }),
  }
}
