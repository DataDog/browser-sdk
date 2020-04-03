import { generateUUID, Observable } from '@datadog/browser-core'
import { getElementContent } from './getElementContent'
import { LifeCycle, LifeCycleEventType, Subscription } from './lifeCycle'
import { UserActionType } from './rum'

const IDLE_DELAY = 100
const BUSY_DELAY = 100
const USER_ACTION_MAX_DURATION = 10_000

interface UserActionEnded {
  id: string
  startTime: number
  duration: number
}

function newUserAction(
  changesObservable: Observable<ChangeEvent>,
  finishCallback: (event: UserActionEnded | undefined) => void
) {
  if (currentUserAction) {
    finishCallback(undefined)
    return
  }

  let idleTimeoutId: ReturnType<typeof setTimeout>
  const id = generateUUID()
  const startTime = performance.now()
  let hasFinished = false

  const validationTimeoutId = setTimeout(() => finish(false), BUSY_DELAY)
  const maxDurationTimeoutId = setTimeout(() => finish(true), USER_ACTION_MAX_DURATION)

  currentUserAction = { id, startTime }

  changesObservable.subscribe(({ isBusy }) => {
    clearTimeout(validationTimeoutId)
    clearTimeout(idleTimeoutId)
    const time = performance.now()
    if (!isBusy) {
      idleTimeoutId = setTimeout(() => finish(true, time), IDLE_DELAY)
    }
  })

  function finish(end: boolean, time = performance.now()) {
    if (hasFinished) {
      return
    }
    hasFinished = true
    clearTimeout(validationTimeoutId)
    clearTimeout(idleTimeoutId)
    clearTimeout(maxDurationTimeoutId)
    currentUserAction = undefined
    finishCallback(end ? { id, startTime, duration: time - startTime } : undefined)
  }
}

export interface ChangeEvent {
  isBusy: boolean
}
function trackPageChanges(lifeCycle: LifeCycle): { observable: Observable<ChangeEvent>; stop(): void } {
  const result = new Observable<ChangeEvent>()
  const subscriptions: Subscription[] = []
  let firstRequestId: undefined | number
  let pendingRequestsCount = 0

  subscriptions.push(lifeCycle.subscribe(LifeCycleEventType.DOM_MUTATED, () => notifyChange()))

  subscriptions.push(
    lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, (entry) => {
      if (entry.entryType !== 'resource') {
        return
      }

      notifyChange()
    })
  )

  subscriptions.push(
    lifeCycle.subscribe(LifeCycleEventType.REQUEST_STARTED, (startEvent) => {
      if (firstRequestId === undefined) {
        firstRequestId = startEvent.requestId
      }

      pendingRequestsCount += 1
      notifyChange()
    })
  )

  subscriptions.push(
    lifeCycle.subscribe(LifeCycleEventType.REQUEST_COLLECTED, (requestDetails) => {
      // If the request started before the tracking start, ignore it
      if (firstRequestId === undefined || requestDetails.requestId < firstRequestId) {
        return
      }
      pendingRequestsCount -= 1
      notifyChange()
    })
  )

  function notifyChange() {
    result.notify({ isBusy: pendingRequestsCount > 0 })
  }

  return {
    observable: result,
    stop() {
      subscriptions.forEach((s) => s.unsubscribe())
    },
  }
}

let currentUserAction: { id: string; startTime: number } | undefined

export const $$tests = {
  newUserAction,
  trackPageChanges,
  resetUserAction() {
    currentUserAction = undefined
  },
}

export function getUserActionId(time: number): string | undefined {
  if (currentUserAction && time >= currentUserAction.startTime) {
    return currentUserAction.id
  }
  return undefined
}

export function startUserActionCollection(lifeCycle: LifeCycle) {
  function clickEventListener(event: Event) {
    if (!(event.target instanceof Element)) {
      return
    }

    const content = getElementContent(event.target)

    const { observable: changesObservable, stop: stopChangesTracking } = trackPageChanges(lifeCycle)

    newUserAction(changesObservable, (userActionDetails) => {
      stopChangesTracking()
      if (userActionDetails) {
        lifeCycle.notify(LifeCycleEventType.USER_ACTION_COLLECTED, {
          duration: userActionDetails.duration,
          id: userActionDetails.id,
          name: content,
          startTime: userActionDetails.startTime,
          type: UserActionType.CLICK,
        })
      }
    })
  }

  addEventListener('click', clickEventListener, { capture: true })

  return {
    stop() {
      removeEventListener('click', clickEventListener, { capture: true })
    },
  }
}
