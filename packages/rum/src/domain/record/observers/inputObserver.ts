import type { DefaultPrivacyLevel, ListenerHandler } from '@datadog/browser-core'
import { instrumentSetter, assign, DOM_EVENT, addEventListeners, forEach } from '@datadog/browser-core'
import { NodePrivacyLevel } from '../../../constants'
import type { InputState } from '../../../types'
import { getEventTarget } from '../eventsUtils'
import { getNodePrivacyLevel, shouldMaskNode } from '../privacy'
import { getElementInputValue, getSerializedNodeId, hasSerializedNode } from '../serialization'

type InputObserverOptions = {
  domEvents?: Array<DOM_EVENT.INPUT | DOM_EVENT.CHANGE>
  target?: Node
}
export type InputCallback = (v: InputState & { id: number }) => void

export function initInputObserver(
  cb: InputCallback,
  defaultPrivacyLevel: DefaultPrivacyLevel,
  { domEvents = [DOM_EVENT.INPUT, DOM_EVENT.CHANGE], target = document }: InputObserverOptions = {}
): ListenerHandler {
  const lastInputStateMap: WeakMap<Node, InputState> = new WeakMap()

  function onElementChange(target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
    const nodePrivacyLevel = getNodePrivacyLevel(target, defaultPrivacyLevel)
    if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
      return
    }

    const type = target.type

    let inputState: InputState
    if (type === 'radio' || type === 'checkbox') {
      if (shouldMaskNode(target, nodePrivacyLevel)) {
        return
      }
      inputState = { isChecked: (target as HTMLInputElement).checked }
    } else {
      const value = getElementInputValue(target, nodePrivacyLevel)
      if (value === undefined) {
        return
      }
      inputState = { text: value }
    }

    // Can be multiple changes on the same node within the same batched mutation observation.
    cbWithDedup(target, inputState)

    // If a radio was checked, other radios with the same name attribute will be unchecked.
    const name = target.name
    if (type === 'radio' && name && (target as HTMLInputElement).checked) {
      forEach(document.querySelectorAll(`input[type="radio"][name="${name}"]`), (el: Element) => {
        if (el !== target) {
          // TODO: Consider the privacy implications for various differing input privacy levels
          cbWithDedup(el, { isChecked: false })
        }
      })
    }
  }

  /**
   * There can be multiple changes on the same node within the same batched mutation observation.
   */
  function cbWithDedup(target: Node, inputState: InputState) {
    if (!hasSerializedNode(target)) {
      return
    }
    const lastInputState = lastInputStateMap.get(target)
    if (
      !lastInputState ||
      (lastInputState as { text?: string }).text !== (inputState as { text?: string }).text ||
      (lastInputState as { isChecked?: boolean }).isChecked !== (inputState as { isChecked?: boolean }).isChecked
    ) {
      lastInputStateMap.set(target, inputState)
      cb(
        assign(
          {
            id: getSerializedNodeId(target),
          },
          inputState
        )
      )
    }
  }

  const { stop: stopEventListeners } = addEventListeners(
    target,
    domEvents,
    (event) => {
      const target = getEventTarget(event)
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        onElementChange(target)
      }
    },
    {
      capture: true,
      passive: true,
    }
  )

  const instrumentationStoppers = [
    instrumentSetter(HTMLInputElement.prototype, 'value', onElementChange),
    instrumentSetter(HTMLInputElement.prototype, 'checked', onElementChange),
    instrumentSetter(HTMLSelectElement.prototype, 'value', onElementChange),
    instrumentSetter(HTMLTextAreaElement.prototype, 'value', onElementChange),
    instrumentSetter(HTMLSelectElement.prototype, 'selectedIndex', onElementChange),
  ]

  return () => {
    instrumentationStoppers.forEach((stopper) => stopper.stop())
    stopEventListeners()
  }
}
