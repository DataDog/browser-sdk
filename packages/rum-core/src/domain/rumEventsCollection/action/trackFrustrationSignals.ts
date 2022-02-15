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
  hadActivity: boolean
  hadError: boolean
  isDrag: boolean
  selectionChange: boolean
  duration: Duration
  focusChange: boolean
  inputChange: boolean
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
    const clicks: Click[] = []

    const subscription = observeClicks(lifeCycle, domMutationObservable, configuration).subscribe((click) => {
      clicks.push(click)
      notifySignals()
      setTimeout(notifySignals, RAGE_DURATION_WINDOW)
    })

    function notifySignals() {
      collectSignals(clicks).forEach((signal) => {
        observable.notify(signal)
      })
    }

    return () => {
      subscription.unsubscribe()
    }
  })
  return observable
}

function observeClicks(lifeCycle: LifeCycle, domMutationObservable: Observable<void>, configuration: RumConfiguration) {
  const observable = new Observable<Click>(() => {
    let activeElement: Element | null = null
    let selectionBefore: boolean
    let selectionChange = false
    let mousedownEvent: MouseEvent
    let inputChange = false

    const { stop: stopMouseDownListener } = addEventListener(
      window,
      DOM_EVENT.MOUSE_DOWN,
      (event: MouseEvent) => {
        mousedownEvent = event
        selectionChange = false
        inputChange = false
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

    const { stop: stopInputListener } = addEventListener(
      window,
      DOM_EVENT.INPUT,
      () => {
        inputChange = true
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
        const name = getActionNameFromElement(clickEvent.target, configuration.actionNameAttribute)

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
              isDrag: mouseEventDistance(mousedownEvent, clickEvent) > DRAG_MIN_DISTANCE,
              focusChange,
              selectionChange,
              name,
              inputChange,
            })
          },
          AUTO_ACTION_MAX_DURATION,
          (resourceUrl) => resourceUrl !== 'https://streaming-collector.datadoghq.com/customdd/tp2'
        )
      },
      { capture: true }
    )

    return () => {
      stopInputListener()
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
    (activeElement instanceof HTMLInputElement && activeElement.selectionStart !== null) ||
    activeElement instanceof HTMLTextAreaElement
  ) {
    // Return true even if the selection is collapsed, because clicking to move the cursor of a text
    // input is a valid behavior.
    return true
  }

  const selection = window.getSelection()!
  return !!selection && !selection.isCollapsed
}

function collectSignals(clicks: Click[]): FrustrationSignal[] {
  const signals: FrustrationSignal[] = []

  while (clicks.length > 0) {
    const action = inspectFirstClicks(clicks)
    if (action.type === FirstClicksType.WaitForMore) {
      break
    }

    if (action.type === FirstClicksType.CreateSignal) {
      const firstClick = clicks[0]
      const lastClick = clicks[action.length - 1]
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

    clicks.splice(0, action.length)
  }

  return signals
}
enum FirstClicksType {
  WaitForMore,
  Ignore,
  CreateSignal,
}
type FirstClicksAction =
  | { type: FirstClicksType.WaitForMore }
  | { type: FirstClicksType.Ignore; length: number; reason: string }
  | { type: FirstClicksType.CreateSignal; length: number; signalType: FrustrationSignal['type']; context?: Context }

function inspectFirstClicks(clicks: readonly Click[]): FirstClicksAction {
  const clickChain = getClickChain(clicks)

  if (!clickChain.isComplete) {
    return {
      type: FirstClicksType.WaitForMore,
    }
  }

  if (clickChain.clicks.length <= 3 && clickChain.clicks.some((click) => click.selectionChange)) {
    return {
      type: FirstClicksType.Ignore,
      length: clickChain.clicks.length,
      reason: 'selection',
    }
  }

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

  const firstClick = clicks[0]

  if (firstClick.hadError) {
    return {
      type: FirstClicksType.CreateSignal,
      length: 1,
      signalType: 'error click',
    }
  }

  if (firstClick.hadActivity) {
    return {
      type: FirstClicksType.Ignore,
      length: 1,
      reason: 'no frustration',
    }
  }

  if (firstClick.inputChange) {
    return {
      type: FirstClicksType.Ignore,
      length: 1,
      reason: 'input change',
    }
  }

  if (firstClick.focusChange) {
    return {
      type: FirstClicksType.Ignore,
      length: 1,
      reason: 'focus change',
    }
  }

  if (firstClick.isDrag) {
    return {
      type: FirstClicksType.Ignore,
      length: 1,
      reason: 'drag and drop',
    }
  }

  return {
    type: FirstClicksType.CreateSignal,
    signalType: 'dead click',
    length: 1,
  }
}

type ClickChain = { isComplete: false } | { isComplete: true; clicks: Click[] }

function getClickChain(clicks: readonly Click[]): ClickChain {
  let index = 0
  for (; index < clicks.length; index += 1) {
    if (clicks[index].hadError || !areClicksSimilar(clicks[Math.max(0, index - RAGE_CLICK_MIN_COUNT)], clicks[index])) {
      break
    }
  }

  if (
    index === clicks.length &&
    timeStampNow() - clicks[clicks.length - 1].startClocks.timeStamp <= RAGE_DURATION_WINDOW
  ) {
    return { isComplete: false }
  }

  return { isComplete: true, clicks: clicks.slice(0, index) }
}

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
