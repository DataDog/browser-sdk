import {
  addMonitoringMessage,
  getCookie,
  monitor,
  ONE_DAY,
  ONE_HOUR,
  ONE_MINUTE,
  SESSION_COOKIE_NAME,
  setCookie,
} from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'

const SESSION_START_COOKIE_NAME = '_dd_exp_s'
const SESSION_TIMEOUT_DURATION = 4 * ONE_HOUR
const CHECK_INTERVAL = ONE_MINUTE
const onStillVisibleCallbacks: Array<() => void> = []

let expandedReported = false
let visiblePageAfterTimeoutReported = false
let visiblePageAfterSessionExpirationReported = false

export function startNewSessionChecks(lifeCycle: LifeCycle) {
  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    setCookie(SESSION_START_COOKIE_NAME, Date.now().toString(), ONE_DAY)
    expandedReported = false
    visiblePageAfterTimeoutReported = false
    visiblePageAfterSessionExpirationReported = false
  })

  expandedSessionCheck()
  timeoutSessionCheck()
  renewedSessionCheck(lifeCycle)

  startVisibilityTracker()
}

function getSessionDuration() {
  return Date.now() - parseInt(getCookie(SESSION_START_COOKIE_NAME)!, 10)
}

/**
 * Send a log when a page with an expired session is visible
 */
function expandedSessionCheck() {
  onPageStillVisible(() => {
    if (!expandedReported && !hasSession() && hasSessionStart() && getSessionDuration() < SESSION_TIMEOUT_DURATION) {
      addMonitoringMessage('[session check][expanded] session should have been expanded')
      expandedReported = true
    }
  })
}

/**
 * Send a log when a session is above 4h
 * Send a log when a session is expired and the page is still visible after a 4h session
 */
function timeoutSessionCheck() {
  setInterval(
    monitor(() => {
      if (hasSession() && hasSessionStart() && getSessionDuration() > SESSION_TIMEOUT_DURATION) {
        addMonitoringMessage('[session check][timeout] session duration above timeout')
        // avoid to trigger this log on following pages
        // other check on session duration should have been triggered at this point
        setCookie(SESSION_START_COOKIE_NAME, '', 1)
      }
    }),
    CHECK_INTERVAL
  )

  onPageStillVisible(() => {
    if (
      !visiblePageAfterTimeoutReported &&
      !hasSession() &&
      hasSessionStart() &&
      getSessionDuration() > SESSION_TIMEOUT_DURATION
    ) {
      addMonitoringMessage('[session check][timeout] page still visible after session timeout')
      visiblePageAfterTimeoutReported = true
    }
  })
}

/**
 * Send a log when a page with an expired session become visible
 * Send a log when a page is renewed by an user interaction
 */
function renewedSessionCheck(lifeCycle: LifeCycle) {
  const hasPageStartedWithASession = hasSession()
  let isFirstRenewal = true

  onPageStillVisible(() => {
    if (!visiblePageAfterSessionExpirationReported && !hasSession()) {
      addMonitoringMessage('[session check][renewed] page visible after session expiration')
      visiblePageAfterSessionExpirationReported = true
    }
  })

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    const isRenewedByUserInteraction = hasPageStartedWithASession || !isFirstRenewal

    if (isRenewedByUserInteraction) {
      addMonitoringMessage('[session check][renewed] session renewed by user interaction')
    }

    isFirstRenewal = false
  })
}

function onPageStillVisible(callback: () => void) {
  onStillVisibleCallbacks.push(callback)
}

function startVisibilityTracker() {
  let visibilityInterval: number

  document.addEventListener(
    'visibilitychange',
    monitor(() => {
      document.visibilityState === 'visible' ? setVisible() : setHidden()
    })
  )
  document.visibilityState === 'visible' ? setVisible() : setHidden()

  function setVisible() {
    onStillVisibleCallbacks.forEach((callback) => callback())
    visibilityInterval = window.setInterval(
      monitor(() => {
        onStillVisibleCallbacks.forEach((callback) => callback())
      }),
      CHECK_INTERVAL
    )
  }

  function setHidden() {
    clearInterval(visibilityInterval)
  }
}

function hasSession() {
  return !!getCookie(SESSION_COOKIE_NAME)
}

function hasSessionStart() {
  return !!getCookie(SESSION_START_COOKIE_NAME)
}
