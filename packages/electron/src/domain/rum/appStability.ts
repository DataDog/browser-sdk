import { Observable, setTimeout, clearTimeout, ONE_SECOND } from '@datadog/browser-core'
import { app } from 'electron'

const WEB_CONTENTS_FINISHED_TIMEOUT = 30 * ONE_SECOND
const APP_STABLE_TIMEOUT = 30 * ONE_SECOND

/**
 * Try to notify when the app is stable after startup
 *
 * https://www.electronjs.org/docs/latest/tutorial/performance#2-loading-and-running-code-too-soon
 * Motivation:
 * As crashes files accesses and parsing can be I/O and CPU intensive, delay them to not impact the main thread during startup
 * Crashes at startup have been observed on Windows VM when executed only on app ready
 */
export function startAppStabilityTracking() {
  const observable = new Observable<void>()

  const timeouts = new Map<number, NodeJS.Timeout>()
  const pending = new Set<number>()
  let notified = false
  let readyTimeout: NodeJS.Timeout | undefined

  app.on('web-contents-created', onWebContentsCreated)

  void app.whenReady().then(() => {
    readyTimeout = setTimeout(notifyOnce, APP_STABLE_TIMEOUT)
  })

  return observable

  function onWebContentsCreated(_event: Electron.Event, webContents: Electron.WebContents) {
    const id = webContents.id
    pending.add(id)

    webContents.once('did-finish-load', onWebContentsFinished)
    webContents.once('destroyed', onWebContentsFinished)

    timeouts.set(id, setTimeout(onWebContentsFinished, WEB_CONTENTS_FINISHED_TIMEOUT))

    function onWebContentsFinished() {
      if (!pending.has(id)) {
        return
      }
      pending.delete(id)
      const timeout = timeouts.get(id)
      if (timeout) {
        clearTimeout(timeout)
        timeouts.delete(id)
      }
      webContents.removeListener('did-finish-load', onWebContentsFinished)
      webContents.removeListener('destroyed', onWebContentsFinished)
      checkLoadingWebContents()
    }
  }

  function checkLoadingWebContents() {
    if (pending.size === 0) {
      notifyOnce()
    }
  }

  function notifyOnce() {
    if (notified) {
      return
    }
    notified = true
    cleanup()
    observable.notify()
  }

  function cleanup() {
    app.removeListener('web-contents-created', onWebContentsCreated)
    if (readyTimeout) {
      clearTimeout(readyTimeout)
      readyTimeout = undefined
    }
    for (const t of timeouts.values()) {
      clearTimeout(t)
    }
    timeouts.clear()
    pending.clear()
  }
}
