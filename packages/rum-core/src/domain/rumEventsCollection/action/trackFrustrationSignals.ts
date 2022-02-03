import type { ClocksState, Duration } from '@datadog/browser-core'
import {
  isExperimentalFeatureEnabled,
  clocksNow,
  display,
  timeStampNow,
  addEventListener,
  DOM_EVENT,
  ONE_SECOND,
  Observable,
  elapsed,
} from '@datadog/browser-core'

import type { LifeCycle } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import { waitIdlePage } from '../../waitIdlePage'
import { AUTO_ACTION_MAX_DURATION } from './trackActions'

export interface FrustrationSignal {
  type: 'rage click' | 'dead click' | 'error click'
  startClocks: ClocksState
  duration: Duration
  event: MouseEvent & { target: Element }
}

interface Click {
  event: MouseEvent & { target: Element }
  startClocks: ClocksState
  hadActivity: boolean
  hadError: boolean
  selectionChange: boolean
  duration: Duration
  focusChange: boolean
}

const RAGE_DURATION_WINDOW = ONE_SECOND
const RAGE_CLICK_MIN_COUNT = 3
const RAGE_MAX_DISTANCE = 100

export function trackFrustrationSignals(lifeCycle: LifeCycle, domMutationObservable: Observable<void>) {
  const observable = new Observable<FrustrationSignal>(() => {
    const clicks: Click[] = []

    const subscription = observeClicks(lifeCycle, domMutationObservable).subscribe((click) => {
      clicks.push(click)
      notifySignals()
      setTimeout(notifySignals, RAGE_DURATION_WINDOW)
    })

    function notifySignals() {
      collectSignals(clicks).forEach((signal) => {
        debug(`🚩 Collect ${signal.type} on ${signal.event.target.nodeName} (duration: ${signal.duration}ms)`)
        observable.notify(signal)
      })
    }

    return () => {
      subscription.unsubscribe()
    }
  })
  return observable
}

function observeClicks(lifeCycle: LifeCycle, domMutationObservable: Observable<void>) {
  const observable = new Observable<Click>(() => {
    let activeElement: Element | null = null
    let selectionBefore: boolean
    let selectionChange = false

    const { stop: stopMouseDownListener } = addEventListener(
      window,
      DOM_EVENT.MOUSE_DOWN,
      () => {
        selectionChange = false
        selectionBefore = hasSelection()
        activeElement = document.activeElement
      },
      { capture: true }
    )

    const { stop: stopSelectionChangeListener } = addEventListener(
      window,
      DOM_EVENT.SELECTION_CHANGE,
      () => {
        // If started without selection, and still without selection, do not count as changed
        if (selectionBefore || hasSelection()) {
          selectionChange = true
        }
      },
      { capture: true }
    )

    const { stop: stopClickListener } = addEventListener(
      window,
      DOM_EVENT.CLICK,
      (clickEvent: MouseEvent) => {
        if (!(clickEvent.target instanceof Element)) {
          return
        }

        let hadError = false
        const hadErrorSubscription = lifeCycle.subscribe(LifeCycleEventType.RAW_ERROR_COLLECTED, () => {
          hadError = true
        })
        const startClocks = clocksNow()
        const focusChange = activeElement !== document.activeElement

        waitIdlePage(
          lifeCycle,
          domMutationObservable,
          (event) => {
            hadErrorSubscription.unsubscribe()
            observable.notify({
              event: clickEvent as MouseEvent & { target: Element },
              startClocks,
              hadActivity: event.hadActivity,
              hadError,
              duration: event.hadActivity ? elapsed(startClocks.timeStamp, event.end) : (0 as Duration),
              focusChange,
              selectionChange,
            })
          },
          AUTO_ACTION_MAX_DURATION
        )
      },
      { capture: true }
    )

    return () => {
      stopMouseDownListener()
      stopSelectionChangeListener()
      stopClickListener()
    }
  })
  return observable
}

function hasSelection() {
  const activeElement = document.activeElement
  if (
    (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) &&
    activeElement.selectionStart !== activeElement.selectionEnd
  ) {
    return true
  }

  const selection = window.getSelection()!
  return !!selection && !selection.isCollapsed
}

function collectSignals(clicks: Click[]): FrustrationSignal[] {
  const signals: FrustrationSignal[] = []

  while (clicks.length !== 0) {
    const rageClickCount = getRageClickCount(clicks)
    const firstClick = clicks[0]!
    const lastRageClick = clicks[rageClickCount - 1]!

    if (
      rageClickCount === clicks.length &&
      timeStampNow() - lastRageClick.startClocks.timeStamp < RAGE_DURATION_WINDOW
    ) {
      // More rage clicks can happen afterward
      break
    }

    if (
      // Selection can happen with one, two or three clicks
      rageClickCount <= 3 &&
      clicks.slice(0, rageClickCount).some((click) => click.selectionChange)
    ) {
      clicks.splice(0, rageClickCount)
      debug('🙅 Clicks ignored (selection)')
    } else if (rageClickCount >= RAGE_CLICK_MIN_COUNT) {
      clicks.splice(0, rageClickCount)

      signals.push({
        type: 'rage click',
        startClocks: firstClick.startClocks,
        duration: ((lastRageClick.startClocks.timeStamp as number) +
          (lastRageClick.duration as number) -
          firstClick.startClocks.timeStamp) as Duration,
        event: firstClick.event,
      })
    } else {
      // Remove the first click
      clicks.shift()!

      if (firstClick.hadError) {
        signals.push({
          type: 'error click',
          startClocks: firstClick.startClocks,
          duration: firstClick.duration,
          event: firstClick.event,
        })
      } else if (firstClick.hadActivity) {
        debug('🙅 Click ignored (no frustration)')
      } else if (firstClick.focusChange) {
        debug('🙅 Click ignored (focus change)')
      } else {
        signals.push({
          type: 'dead click',
          startClocks: firstClick.startClocks,
          duration: firstClick.duration,
          event: firstClick.event,
        })
      }
    }
  }

  return signals
}

function getRageClickCount(clicks: Click[]) {
  let count = 1

  for (let i = 1; i < clicks.length; i += 1) {
    if (
      // Same target element
      clicks[0].event.target === clicks[i].event.target &&
      // Similar position
      clickDistance(clicks[0].event, clicks[i].event) < RAGE_MAX_DISTANCE &&
      // Similar time
      clicks[i].startClocks.timeStamp - clicks[Math.max(0, i - RAGE_CLICK_MIN_COUNT)].startClocks.timeStamp <=
        RAGE_DURATION_WINDOW
    ) {
      count += 1
    } else {
      break
    }
  }

  return count
}

function clickDistance(origin: MouseEvent, other: MouseEvent) {
  return Math.sqrt(Math.pow(origin.clientX - other.clientX, 2) + Math.pow(origin.clientY - other.clientY, 2))
}

function debug(message: string) {
  if (isExperimentalFeatureEnabled('frustration-signals-debug')) {
    display.log(message)
  }
}
