import { addEventListener, DOM_EVENT, EventEmitter } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import { CreationReason } from '../types'

export function trackSegmentRenewal(
  lifeCycle: LifeCycle,
  renewSegment: (creationReason: CreationReason) => void,
  emitter: EventEmitter = window
) {
  // Flush when the RUM view changes
  const { unsubscribe: unsubscribeViewCreated } = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, () => {
    renewSegment('view_change')
  })

  // Flush when the session is renewed
  const { unsubscribe: unsubscribeSessionRenewed } = lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    renewSegment('session_renewed')
  })

  // Flush when leaving the page
  const { unsubscribe: unsubscribeBeforeUnload } = lifeCycle.subscribe(LifeCycleEventType.BEFORE_UNLOAD, () => {
    renewSegment('before_unload')
  })

  // Flush when visibility changes
  const { stop: unsubscribeVisibilityChange } = addEventListener(
    emitter,
    DOM_EVENT.VISIBILITY_CHANGE,
    () => {
      if (document.visibilityState === 'hidden') {
        renewSegment('visibility_change')
      }
    },
    { capture: true }
  )

  return {
    stop() {
      unsubscribeViewCreated()
      unsubscribeBeforeUnload()
      unsubscribeVisibilityChange()
      unsubscribeSessionRenewed()
    },
  }
}
