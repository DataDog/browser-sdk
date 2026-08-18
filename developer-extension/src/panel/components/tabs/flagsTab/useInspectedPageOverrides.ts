import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { FlagOverride, FlagState } from './inspectedPageFlags'
import {
  clearAllOverrides,
  deleteOverride,
  readFlagState,
  reloadInspectedPage,
  sanitizeOverrides,
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
  isCancelled: () => boolean
): Promise<void> {
  let lastRead: FlagState | null = null
  for (let attempts = 1; ; attempts++) {
    const next = await readFlagState()
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
 */
export function useInspectedPageOverrides(): OverridesController {
  const [state, setState] = useState<FlagPageState>({
    status: 'loading',
    overrides: {},
    devtoolsEnabled: false,
    error: null,
  })
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
    void settleFlagState(setState, () => cancelled)
  }, [])

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
    (flagKey: string, override: FlagOverride) => enqueue(() => writeOverride(flagKey, override)),
    [enqueue]
  )

  const clearOverride = useCallback((flagKey: string) => enqueue(() => deleteOverride(flagKey)), [enqueue])

  const clearAll = useCallback(() => enqueue(() => clearAllOverrides()), [enqueue])

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
  }
}

function noop() {
  // Used to normalize the mutation queue back to a never-rejecting promise after a failure.
}
