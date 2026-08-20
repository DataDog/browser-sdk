import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { FlagOverride, FlagState } from './inspectedPageFlags'
import {
  clearAllOverrides,
  deleteOverride,
  readFlagState,
  reloadInspectedPage,
  sanitizeOverrides,
  syncSiteOverrides,
  writeOverride,
} from './inspectedPageFlags'

// The wrapper's initialize() runs asynchronously after a (re)load, so its marker can be briefly
// absent on a page that does have it. Re-check over this window instead of immediately flashing the
// "not detected" warning. Counted in ticks rather than wall-clock so a clock change can't skew it.
const SETTLE_INTERVAL_MS = 250
const SETTLE_TIMEOUT_MS = 2500
const MAX_SETTLE_ATTEMPTS = Math.ceil(SETTLE_TIMEOUT_MS / SETTLE_INTERVAL_MS)

const PAGE_LOADING_MESSAGE = 'The inspected page is still loading — try again in a moment.'

export type FlagPageStatus = 'loading' | 'ready' | 'error'

interface FlagPageState extends FlagState {
  status: FlagPageStatus
  error: string | null
}

export interface OverridesController extends FlagPageState {
  setOverride: (flagKey: string, override: FlagOverride) => Promise<void>
  clearOverride: (flagKey: string) => Promise<void>
  clearAll: () => Promise<void>
  reloadPage: () => void
  /** Scoping changed which overrides apply; the page needs a reload to pick it up. */
  siteSwitchNeedsReload: boolean
  /** Scoping failed, so the page may be applying another site's overrides. */
  scopeError: string | null
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Resolves the inspected page's status by polling for the provider marker over the settle window,
// reporting each transition through `setState` and bailing as soon as `isCancelled()` flips (a newer
// navigation, a newer settle, or unmount). Resolves early the instant the marker appears; otherwise
// decides once the window elapses:
//  - a read shows the marker              -> ready, devtoolsEnabled: true
//  - window elapses, good read, no marker -> ready, devtoolsEnabled: false (wrapper genuinely absent)
//  - only the final read failed           -> keep the last good state (an earlier read succeeded)
//  - no read ever succeeded               -> error
async function settleFlagState(
  setState: Dispatch<SetStateAction<FlagPageState>>,
  isCancelled: () => boolean,
  site?: string
): Promise<void> {
  let lastRead: FlagState | null = null
  for (let attempts = 1; ; attempts++) {
    const next = await readFlagState(site)
    if (isCancelled()) {
      return
    }
    if (next) {
      lastRead = next
    }
    if (next?.devtoolsEnabled) {
      setState({ status: 'ready', overrides: next.overrides, devtoolsEnabled: true, error: null })
      return
    }
    if (attempts >= MAX_SETTLE_ATTEMPTS) {
      if (next) {
        setState({ status: 'ready', overrides: next.overrides, devtoolsEnabled: false, error: null })
      } else if (lastRead) {
        // Commit the last good *full* state, so a devtoolsEnabled left over from a previous page
        // can't linger.
        setState({
          status: 'ready',
          overrides: lastRead.overrides,
          devtoolsEnabled: lastRead.devtoolsEnabled,
          error: null,
        })
      } else {
        setState({
          status: 'error',
          overrides: {},
          devtoolsEnabled: false,
          error: 'Could not read the inspected page.',
        })
      }
      return
    }
    // Keep the latest overrides visible while we wait for the marker to appear.
    if (next) {
      setState((prev) => ({ ...prev, overrides: next.overrides }))
    }
    await delay(SETTLE_INTERVAL_MS)
    if (isCancelled()) {
      return
    }
  }
}

/**
 * Tracks the inspected page's overrides as an explicit lifecycle — `loading | ready | error` — driven
 * by its navigation events. This avoids the "DatadogDevtools not detected" warning flashing when
 * applying an override reloads the page: while a navigation is in flight we stay `loading` (warning
 * hidden, writes blocked), and once it finishes we re-check for the marker over a short settle window
 * before deciding it's absent.
 *
 * Assumes a single mounted instance — the mutation queue only serializes writes within one hook.
 *
 * `site` scopes everything to the connected Datadog site, so overrides made on one neither apply nor
 * show up on another. Omitted when signed out, where the caller wants what the page is applying.
 */
export function useInspectedPageOverrides(site?: string): OverridesController {
  const [state, setState] = useState<FlagPageState>({
    status: 'loading',
    overrides: {},
    devtoolsEnabled: false,
    error: null,
  })
  const [siteSwitchNeedsReload, setSiteSwitchNeedsReload] = useState(false)
  const [scopeError, setScopeError] = useState<string | null>(null)
  // Serializes mutations so overlapping read-modify-writes can't clobber each other.
  const mutationQueue = useRef<Promise<void>>(Promise.resolve())
  // Cancels an in-flight settle when a newer navigation (or unmount) supersedes it.
  const cancelSettle = useRef<() => void>(noop)
  // Bumped before each write and on navigation start, so a write still in flight when a new page
  // loads can't clobber it with the previous origin's overrides.
  const readSeq = useRef(0)
  // Flipped false on unmount so an async write's follow-up read can't setState on a torn-down hook.
  const mounted = useRef(true)
  // Mirror of status for the write guard, since event handlers read it outside render. Set
  // synchronously on navigation start so a queued write can't slip through before the re-render.
  const statusRef = useRef<FlagPageStatus>(state.status)
  statusRef.current = state.status

  // A fresh `cancelled` flag per call supersedes any in-flight settle.
  const settle = useCallback(() => {
    cancelSettle.current()
    let cancelled = false
    cancelSettle.current = () => {
      cancelled = true
    }
    void settleFlagState(setState, () => cancelled, site)
  }, [site])

  // Scope the page to the connected site. Reruns on navigation too, via `status` returning to ready.
  //
  // Known limitation (accepted): this runs outside the mutation queue, which covers one hook
  // instance anyway — the provider remounts on a site change. A write sent just before the switch
  // can land after this sync and restore the old site's copy until the next one.
  useEffect(() => {
    if (!site || state.status !== 'ready') {
      return
    }
    let cancelled = false
    const seq = readSeq.current
    void syncSiteOverrides(site).then((result) => {
      if (cancelled) {
        return
      }
      if (!result) {
        // The page may still be applying another site's overrides, and the list wouldn't show it.
        setScopeError("Couldn't scope overrides to this site. The page may still be applying another site's.")
        return
      }
      setScopeError(null)
      // Prompting when nothing changed would make every sign-in demand a needless reload.
      if (result.changed) {
        setSiteSwitchNeedsReload(true)
      }
      // Adoption can fill the store after the settle read found none. Skipped if a newer write or
      // navigation already landed.
      if (seq === readSeq.current) {
        setState((prev) => ({ ...prev, overrides: result.overrides }))
      }
    })
    return () => {
      cancelled = true
    }
  }, [site, state.status])

  // Known limitation (accepted): terminal events aren't correlated to a specific navigation — the
  // webNavigation API exposes no id spanning onBeforeNavigate→onCompleted. In a rare overlapping-
  // navigation race a stale terminal event could settle to `ready` mid-nav; it self-corrects on the
  // next read and the write guard limits exposure.
  useEffect(() => {
    mounted.current = true
    settle()

    const isInspectedTopFrame = (details: { tabId: number; frameId: number }) =>
      details.tabId === chrome.devtools.inspectedWindow.tabId && details.frameId === 0

    const onBeforeNavigate = (details: { tabId: number; frameId: number }) => {
      if (!isInspectedTopFrame(details)) {
        return
      }
      cancelSettle.current()
      // Invalidate any in-flight read from the previous lifecycle, and block writes synchronously
      // (before the re-render mirrors statusRef from state).
      readSeq.current += 1
      statusRef.current = 'loading'
      // This may be the reload the banner asked for. If the page still needs one, the sync that
      // runs once it settles raises the banner again.
      setSiteSwitchNeedsReload(false)
      setState((prev) => ({ ...prev, status: 'loading', error: null }))
    }
    const onNavigationSettled = (details: { tabId: number; frameId: number }) => {
      if (isInspectedTopFrame(details)) {
        settle()
      }
    }

    chrome.webNavigation.onBeforeNavigate.addListener(onBeforeNavigate)
    chrome.webNavigation.onCompleted.addListener(onNavigationSettled)
    chrome.webNavigation.onErrorOccurred.addListener(onNavigationSettled)
    return () => {
      mounted.current = false
      cancelSettle.current()
      chrome.webNavigation.onBeforeNavigate.removeListener(onBeforeNavigate)
      chrome.webNavigation.onCompleted.removeListener(onNavigationSettled)
      chrome.webNavigation.onErrorOccurred.removeListener(onNavigationSettled)
    }
  }, [settle])

  /**
   * Queues each mutation behind the previous one, and blocks writes while the page is navigating so a
   * read-modify-write can't land on a different origin's storage than the one shown. The guard is
   * re-checked when the write actually runs — not just when enqueued — because a write can reach the
   * front of the queue after a navigation has started.
   */
  const enqueue = useCallback((mutate: () => Promise<Record<string, unknown>>) => {
    if (statusRef.current !== 'ready') {
      return Promise.reject(new Error(PAGE_LOADING_MESSAGE))
    }
    const attempt = mutationQueue.current.then(async () => {
      if (statusRef.current !== 'ready') {
        throw new Error(PAGE_LOADING_MESSAGE)
      }
      // A navigation starting mid-write bumps readSeq too, so the update below is dropped rather than
      // landing on the new origin. The write returns the resulting map, so no follow-up read needed.
      const seq = ++readSeq.current
      const overrides = await mutate()
      if (mounted.current && seq === readSeq.current) {
        setState((prev) => ({ ...prev, overrides: sanitizeOverrides(overrides) }))
      }
    })
    mutationQueue.current = attempt.catch(noop)
    return attempt
  }, [])

  const setOverride = useCallback(
    (flagKey: string, override: FlagOverride) => enqueue(() => writeOverride(flagKey, override, site)),
    [enqueue, site]
  )

  const clearOverride = useCallback((flagKey: string) => enqueue(() => deleteOverride(flagKey, site)), [enqueue, site])

  const clearAll = useCallback(() => enqueue(() => clearAllOverrides(site)), [enqueue, site])

  const reloadPage = useCallback(() => reloadInspectedPage(), [])

  return {
    status: state.status,
    overrides: state.overrides,
    devtoolsEnabled: state.devtoolsEnabled,
    error: state.error,
    setOverride,
    clearOverride,
    clearAll,
    reloadPage,
    siteSwitchNeedsReload,
    scopeError,
  }
}

function noop() {
  // Used to normalize the mutation queue back to a never-rejecting promise after a failure.
}
