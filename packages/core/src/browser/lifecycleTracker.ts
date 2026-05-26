import type { Configuration } from '../domain/configuration'
import { dateNow } from '../tools/utils/timeUtils'
import { isWorkerEnvironment } from '../tools/globalObject'
import { addEventListener, addEventListeners, DOM_EVENT } from './addEventListener'

export type LifecycleEventName =
  | 'visibilitychange'
  | 'pagehide'
  | 'pageshow'
  | 'freeze'
  | 'resume'
  | 'beforeunload'
  | 'prerenderingchange'

export interface LifecycleContext {
  lastLifecycleEvent: LifecycleEventName | undefined
  timeSinceLifecycleEvent: number | undefined
  restoredFromBfcache: boolean
  wasPrerendered: boolean
}

let lastEvent: { name: LifecycleEventName; at: number } | undefined
let restoredFromBfcache = false
let wasPrerendered = false
let started = false
let stopListeners: (() => void) | undefined

export function startLifecycleTracker(configuration: Configuration): void {
  if (started || isWorkerEnvironment || typeof window === 'undefined') {
    return
  }
  started = true

  if (typeof document !== 'undefined' && (document as Document & { prerendering?: boolean }).prerendering) {
    wasPrerendered = true
  }

  const { stop: stopWindowListeners } = addEventListeners(
    configuration,
    window,
    [
      DOM_EVENT.VISIBILITY_CHANGE,
      DOM_EVENT.PAGE_HIDE,
      DOM_EVENT.PAGE_SHOW,
      DOM_EVENT.FREEZE,
      DOM_EVENT.RESUME,
      DOM_EVENT.BEFORE_UNLOAD,
    ],
    (event) => {
      lastEvent = { name: event.type as LifecycleEventName, at: dateNow() }
      if (event.type === DOM_EVENT.PAGE_SHOW && (event as PageTransitionEvent).persisted) {
        restoredFromBfcache = true
      }
    },
    { capture: true }
  )

  let stopPrerenderingListener: (() => void) | undefined
  if (typeof document !== 'undefined' && 'prerendering' in document) {
    stopPrerenderingListener = addEventListener(
      configuration,
      document,
      'prerenderingchange',
      () => {
        wasPrerendered = true
        lastEvent = { name: 'prerenderingchange', at: dateNow() }
      },
      { capture: true }
    ).stop
  }

  stopListeners = () => {
    stopWindowListeners()
    stopPrerenderingListener?.()
  }
}

export function getLifecycleContext(): LifecycleContext {
  return {
    lastLifecycleEvent: lastEvent?.name,
    timeSinceLifecycleEvent: lastEvent ? dateNow() - lastEvent.at : undefined,
    restoredFromBfcache,
    wasPrerendered,
  }
}

export function resetLifecycleTracker(): void {
  stopListeners?.()
  stopListeners = undefined
  lastEvent = undefined
  restoredFromBfcache = false
  wasPrerendered = false
  started = false
}
