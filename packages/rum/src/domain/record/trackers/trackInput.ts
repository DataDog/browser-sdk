import { instrumentSetter, assign, DOM_EVENT, addEventListeners, forEach, noop } from '@datadog/browser-core'
import { NodePrivacyLevel, getNodePrivacyLevel, shouldMaskNode, cssEscape } from '@datadog/browser-rum-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { IncrementalSource } from '../../../types'
import type { BrowserIncrementalSnapshotRecord, InputData, InputState } from '../../../types'
import { getEventTarget } from '../eventsUtils'
import { getElementInputValue, getSerializedNodeId, hasSerializedNode } from '../serialization'
import { assembleIncrementalSnapshot } from '../assembly'
import type { Tracker } from './types'

export type InputCallback = (incrementalSnapshotRecord: BrowserIncrementalSnapshotRecord) => void

export function trackInput(
  configuration: RumConfiguration,
  inputCb: InputCallback,
  target: Document | ShadowRoot = document
): Tracker {
  const defaultPrivacyLevel = configuration.defaultPrivacyLevel
  const lastInputStateMap: WeakMap<Node, InputState> = new WeakMap()

  const isShadowRoot = target !== document

  const { stop: stopEventListeners } = addEventListeners(
    configuration,
    target,
    // The 'input' event bubbles across shadow roots, so we don't have to listen for it on shadow
    // roots since it will be handled by the event listener that we did add to the document. Only
    // the 'change' event is blocked and needs to be handled on shadow roots.
    isShadowRoot ? [DOM_EVENT.CHANGE] : [DOM_EVENT.INPUT, DOM_EVENT.CHANGE],
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

  let stopPropertySetterInstrumentation: () => void
  if (!isShadowRoot) {
    const instrumentationStoppers = [
      instrumentSetter(HTMLInputElement.prototype, 'value', onElementChange),
      instrumentSetter(HTMLInputElement.prototype, 'checked', onElementChange),
      instrumentSetter(HTMLSelectElement.prototype, 'value', onElementChange),
      instrumentSetter(HTMLTextAreaElement.prototype, 'value', onElementChange),
      instrumentSetter(HTMLSelectElement.prototype, 'selectedIndex', onElementChange),
    ]
    stopPropertySetterInstrumentation = () => {
      instrumentationStoppers.forEach((stopper) => stopper.stop())
    }
  } else {
    stopPropertySetterInstrumentation = noop
  }

  return {
    stop: () => {
      stopPropertySetterInstrumentation()
      stopEventListeners()
    },
  }

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
      forEach(document.querySelectorAll(`input[type="radio"][name="${cssEscape(name)}"]`), (el: Element) => {
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
      inputCb(
        assembleIncrementalSnapshot<InputData>(
          IncrementalSource.Input,
          assign(
            {
              id: getSerializedNodeId(target),
            },
            inputState
          )
        )
      )
    }
  }
}
