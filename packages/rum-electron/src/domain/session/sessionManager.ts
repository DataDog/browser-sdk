// eslint-disable-next-line local-rules/disallow-side-effects
import { performance } from 'perf_hooks'
// eslint-disable-next-line local-rules/disallow-side-effects
import { app, BrowserWindow } from 'electron'
import type { Context, Observable, RelativeTime } from '@datadog/browser-core'
import { ContextHistory, monitor, SESSION_TIME_OUT_DELAY } from '@datadog/browser-core'
import type { CookieOptions } from '../../browser/cookie'
import { startSessionStore } from './sessionStore'

export interface SessionManager<TrackingType extends string> {
  findActiveSession: (startTime?: RelativeTime) => SessionContext<TrackingType> | undefined
  renewObservable: Observable<void>
  expireObservable: Observable<void>
}

export interface SessionContext<TrackingType extends string> extends Context {
  id: string
  trackingType: TrackingType
}

export const VISIBILITY_CHECK_DELAY = 60 * 1000
const SESSION_CONTEXT_TIMEOUT_DELAY = SESSION_TIME_OUT_DELAY
let stopCallbacks: Array<() => void> = []

export async function startSessionManager<TrackingType extends string>(
  options: CookieOptions,
  productKey: string,
  computeSessionState: (rawTrackingType?: string) => {
    trackingType: TrackingType
    isTracked: boolean
  }
): Promise<SessionManager<TrackingType>> {
  const sessionStore = await startSessionStore(options, productKey, computeSessionState)
  stopCallbacks.push(() => sessionStore.stop())

  const sessionContextHistory = new ContextHistory<SessionContext<TrackingType>>(SESSION_CONTEXT_TIMEOUT_DELAY)
  stopCallbacks.push(() => sessionContextHistory.stop())

  sessionStore.renewObservable.subscribe(() => {
    sessionContextHistory.setCurrent(buildSessionContext(), relativeNow())
  })
  sessionStore.expireObservable.subscribe(() => {
    sessionContextHistory.closeCurrent(relativeNow())
  })

  await sessionStore.expandOrRenewSession()
  sessionContextHistory.setCurrent(buildSessionContext(), 0 as RelativeTime)

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  trackActivity(() => sessionStore.expandOrRenewSession())
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  trackVisibility(() => sessionStore.expandSession())

  function buildSessionContext() {
    return {
      id: sessionStore.getSession().id!,
      trackingType: sessionStore.getSession()[productKey] as TrackingType,
    }
  }

  return {
    findActiveSession: (startTime) => sessionContextHistory.find(startTime),
    renewObservable: sessionStore.renewObservable,
    expireObservable: sessionStore.expireObservable,
  }
}

export function stopSessionManager() {
  stopCallbacks.forEach((e) => e())
  stopCallbacks = []
}

function trackActivity(expandOrRenewSession: () => void) {
  app.on('browser-window-created', expandOrRenewSession)
  app.on('before-quit', stopSessionManager)
}

function trackVisibility(expandSession: () => void) {
  const expandSessionWhenVisible = monitor(() => {
    if (BrowserWindow.getAllWindows().find((w) => w.isVisible())) {
      expandSession()
    }
  })

  app.on('browser-window-focus', expandSessionWhenVisible)
  stopCallbacks.push(() => app.removeListener('browser-window-focus', expandSessionWhenVisible))

  const visibilityCheckInterval = setInterval(expandSessionWhenVisible, VISIBILITY_CHECK_DELAY)
  stopCallbacks.push(() => {
    clearInterval(visibilityCheckInterval)
  })
}

export function relativeNow() {
  return performance.now() as RelativeTime
}
