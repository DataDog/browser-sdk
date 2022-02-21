import type { ClocksState, Context, Duration } from '@datadog/browser-core'
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
import type { RumConfiguration } from '../../configuration'
import type { LifeCycle } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import { waitIdlePage } from '../../waitIdlePage'
import { getActionNameFromElement } from './getActionNameFromElement'
import { AUTO_ACTION_MAX_DURATION } from './trackActions'

export interface FrustrationSignal {
  type: 'rage click' | 'dead click' | 'error click'
  startClocks: ClocksState
  duration: Duration
  event: MouseEvent & { target: Element }
  name: string
  context?: Context
}

interface Click {
  event: MouseEvent & { target: Element }
  startClocks: ClocksState
  legitimateUserAction: 'selection change' | 'activity' | 'drag' | 'focus change' | 'input change' | false
  firstErrorTime: Duration | undefined
  duration: Duration
  name: string
}

const RAGE_DURATION_WINDOW = ONE_SECOND
const RAGE_CLICK_MIN_COUNT = 3
const RAGE_MAX_DISTANCE = 100
const DRAG_MIN_DISTANCE = 15

export function trackFrustrationSignals(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  configuration: RumConfiguration
) {
  const observable = new Observable<FrustrationSignal>(() => {
    const clicksBuffer: Click[] = []

    const subscription = observeClicks(lifeCycle, domMutationObservable, configuration).subscribe((click) => {
      clicksBuffer.push(click)
      // Try to flush signals immediately and after the maximum duration used for a click chain, to
      // make sure the click is producing a signal as quickly as possible.
      flushSignals()
      setTimeout(flushSignals, RAGE_DURATION_WINDOW)
    })

    function flushSignals() {
      collectSignals(clicksBuffer).forEach((signal) => {
        observable.notify(signal)
      })
    }

    return () => {
      subscription.unsubscribe()
    }
  })
  return observable
}

/**
 * Observe click events and gather data of what's happening before and after the click.
 */
function observeClicks(lifeCycle: LifeCycle, domMutationObservable: Observable<void>, configuration: RumConfiguration) {
  const observable = new Observable<Click>(() => {
    // A click should be preceded by a mouse down event. Initialize a state to observe what
    // happens right before the click
    let beforeClickState:
      | {
          mouseDownEvent: MouseEvent
          hadEmptyWindowSelection: boolean
          activeElement: Element | null
          selectionChange: boolean
        }
      | undefined
    const { stop: stopMouseDownListener } = addEventListener(
      window,
      DOM_EVENT.MOUSE_DOWN,
      (event: MouseEvent) => {
        beforeClickState = {
          mouseDownEvent: event,
          hadEmptyWindowSelection: hasEmptyWindowSelection(),
          activeElement: document.activeElement,
          selectionChange: false,
        }
      },
      { capture: true }
    )

    // Capture selection change. This event is triggered when the window selection changes
    // (occurring across multiple DOM elements) or when the selection inside a text input / textarea
    // element changes)
    const { stop: stopSelectionChangeListener } = addEventListener(
      window,
      DOM_EVENT.SELECTION_CHANGE,
      () => {
        if (!beforeClickState) return

        if (
          // We want to consider any text input selection change, even empty ones because it could
          // be a caret move that should not be considered as a dead click
          hasTextInputSelection() ||
          // but we don't want the same behavior for window selection: ignore the case where the
          // window selection changed but stayed empty
          !(beforeClickState.hadEmptyWindowSelection && hasEmptyWindowSelection())
        ) {
          beforeClickState.selectionChange = true
        }
      },
      { capture: true }
    )

    const { stop: stopClickListener } = addEventListener(
      window,
      DOM_EVENT.CLICK,
      (clickEvent: MouseEvent) => {
        if (!(clickEvent.target instanceof Element) || !beforeClickState) {
          return
        }
        const startClocks = clocksNow()
        const name = getActionNameFromElement(clickEvent.target, configuration.actionNameAttribute)

        // Track whether an error occurs while the page has activity, to produce error clicks.
        let firstErrorTime: Duration | undefined
        const hadErrorSubscription = lifeCycle.subscribe(LifeCycleEventType.RAW_ERROR_COLLECTED, () => {
          firstErrorTime = elapsed(startClocks.timeStamp, timeStampNow())
        })

        // Track whether the focus changed (legitimate user action)
        const focusChange = beforeClickState.activeElement !== document.activeElement

        // Track whether the click looks like a drag/drop: the mouse down event is far away from the
        // click event (legitimate user action)
        const isDrag = mouseEventDistance(beforeClickState.mouseDownEvent, clickEvent) > DRAG_MIN_DISTANCE

        // Copy `beforeClickState` value to make sure it won't change if another mousedown occurs
        // while the page isn't idle.
        const selectionChange = beforeClickState.selectionChange

        // Track whether the click lead to an input change (check box being checked, text input
        // edited...). The 'input' event is triggered slightly after the 'click' event.
        let inputChange = false
        const { stop: stopInputListener } = addEventListener(
          window,
          DOM_EVENT.INPUT,
          () => {
            inputChange = true
          },
          { capture: true }
        )
        // Make sure to unregister the listener quickly so we don't intercept input events that were
        // not induced by the click.
        setTimeout(stopInputListener)

        waitIdlePage(
          lifeCycle,
          domMutationObservable,
          (idlePageEvent) => {
            hadErrorSubscription.unsubscribe()
            observable.notify({
              event: clickEvent as MouseEvent & { target: Element },
              startClocks,
              legitimateUserAction: selectionChange
                ? 'selection change'
                : idlePageEvent.hadActivity
                ? 'activity'
                : isDrag
                ? 'drag'
                : focusChange
                ? 'focus change'
                : inputChange
                ? 'input change'
                : false,
              firstErrorTime,
              duration: idlePageEvent.hadActivity ? elapsed(startClocks.timeStamp, idlePageEvent.end) : (0 as Duration),
              name,
            })
          },
          AUTO_ACTION_MAX_DURATION,
          (resourceUrl) => resourceUrl !== 'https://streaming-collector.datadoghq.com/customdd/tp2'
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

function hasTextInputSelection() {
  const activeElement = document.activeElement
  return (
    (activeElement instanceof HTMLInputElement && activeElement.selectionStart !== null) ||
    activeElement instanceof HTMLTextAreaElement
  )
}

function hasEmptyWindowSelection() {
  const selection = window.getSelection()!
  return !selection || selection.isCollapsed
}

/**
 * Try to produce as many signals as possible from clicks in the buffer. Clicks that should be
 * ignored or used to generate signals are removed from the buffer.
 */
function collectSignals(clicksBuffer: Click[]): FrustrationSignal[] {
  const signals: FrustrationSignal[] = []

  while (clicksBuffer.length > 0) {
    const action = inspectFirstClicks(clicksBuffer)
    if (action.type === FirstClicksType.WaitForMore) {
      break
    }

    if (action.type === FirstClicksType.CreateSignal) {
      const firstClick = clicksBuffer[0]
      const lastClick = clicksBuffer[action.length - 1]
      const signal: FrustrationSignal = {
        type: action.signalType,
        startClocks: firstClick.startClocks,
        event: firstClick.event,
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
        duration: (lastClick.startClocks.timeStamp - firstClick.startClocks.timeStamp + lastClick.duration) as Duration,
        name: firstClick.name,
        context: action.context,
      }
      signals.push(signal)
      debug(`🚩 ${signal.type} on "${signal.name}" (duration: ${signal.duration}ms)`)
    } else {
      debug(`🙅 ${action.length} click${action.length > 1 ? 's' : ''} ignored (${action.reason})`)
    }

    clicksBuffer.splice(0, action.length)
  }

  return signals
}

enum FirstClicksType {
  CreateSignal,
  Ignore,
  WaitForMore,
}

type FirstClicksAction =
  // Create a signal with the given `signalType` based on the first `length` clicks.
  | { type: FirstClicksType.CreateSignal; length: number; signalType: FrustrationSignal['type']; context?: Context }
  // Ignore the first `length` clicks.
  | { type: FirstClicksType.Ignore; length: number; reason: string }
  // More clicks are needed before we know which signal should be produced.
  | { type: FirstClicksType.WaitForMore }

/**
 * Inspect the first clicks of the buffer, and return an action to be executed.
 */
function inspectFirstClicks(clicksBuffer: readonly Click[]): FirstClicksAction {
  const clickChain = getClickChain(clicksBuffer)

  if (!clickChain.isComplete) {
    return {
      type: FirstClicksType.WaitForMore,
    }
  }

  // A chain of (at most) three clicks that changed the selection should not be considered as a
  // "rage click" since it may be a legitimate action to select a word or a paragraph.
  if (
    clickChain.clicks.length <= 3 &&
    clickChain.clicks.some((click) => click.legitimateUserAction === 'selection change')
  ) {
    return {
      type: FirstClicksType.Ignore,
      length: clickChain.clicks.length,
      reason: 'selection change',
    }
  }

  // If the click chain is big enough, let's generate a rage click
  if (clickChain.clicks.length >= RAGE_CLICK_MIN_COUNT) {
    return {
      type: FirstClicksType.CreateSignal,
      signalType: 'rage click',
      length: clickChain.clicks.length,
      context: {
        same_target: clickChain.clicks.every((click) => clickChain.clicks[0].event.target === click.event.target),
        count: clickChain.clicks.length,
      },
    }
  }

  // Else focus on the first click only
  const firstClick = clicksBuffer[0]

  // If it had an error, let's report it as a dead click
  if (firstClick.firstErrorTime !== undefined) {
    return {
      type: FirstClicksType.CreateSignal,
      length: 1,
      signalType: 'error click',
      context: {
        first_error_time: firstClick.firstErrorTime,
      },
    }
  }

  // If it had a legitimate user action, let's ignore it
  if (firstClick.legitimateUserAction) {
    return {
      type: FirstClicksType.Ignore,
      length: 1,
      reason: firstClick.legitimateUserAction,
    }
  }

  // Else report a dead click
  return {
    type: FirstClicksType.CreateSignal,
    signalType: 'dead click',
    length: 1,
  }
}

type ClickChain = { isComplete: false } | { isComplete: true; clicks: Click[] }

/**
 * Compute a "click chain" of similar clicks by comparing the first clicks of the clicks buffer. The
 * chain is only considered complete if no future click can make it bigger.
 */
function getClickChain(clicksBuffer: readonly Click[]): ClickChain {
  let index = 0
  for (; index < clicksBuffer.length; index += 1) {
    if (
      // Clicks with error should not be part of the chain, because they should be used individually
      // to produce error clicks.
      clicksBuffer[index].firstErrorTime !== undefined ||
      // Iterate while we find similar clicks using a sliding window.
      !areClicksSimilar(clicksBuffer[Math.max(0, index - RAGE_CLICK_MIN_COUNT)], clicksBuffer[index])
    ) {
      break
    }
  }

  if (
    // If all clicks in the buffer are similar and the last click is recent enough, this chain may
    // be incomplete.
    index === clicksBuffer.length &&
    timeStampNow() - clicksBuffer[clicksBuffer.length - 1].startClocks.timeStamp <= RAGE_DURATION_WINDOW
  ) {
    return { isComplete: false }
  }

  return { isComplete: true, clicks: clicksBuffer.slice(0, index) }
}

/**
 * Checks whether two clicks are similar
 */
function areClicksSimilar(first: Click, second: Click) {
  return (
    first === second ||
    // Similar position
    (mouseEventDistance(first.event, second.event) < RAGE_MAX_DISTANCE &&
      // Similar time
      first.startClocks.timeStamp - second.startClocks.timeStamp <= RAGE_DURATION_WINDOW)
  )
}

function mouseEventDistance(origin: MouseEvent, other: MouseEvent) {
  return Math.sqrt(Math.pow(origin.clientX - other.clientX, 2) + Math.pow(origin.clientY - other.clientY, 2))
}

function debug(message: string) {
  if (isExperimentalFeatureEnabled('frustration-signals-debug')) {
    display.log(message)
  }
}
