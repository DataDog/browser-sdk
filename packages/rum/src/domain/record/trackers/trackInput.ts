import { instrumentSetter, DOM_EVENT, addEventListeners, noop } from '@datadog/browser-core'
import { NodePrivacyLevel, getNodePrivacyLevel, shouldMaskNode } from '@datadog/browser-rum-core'
import { IncrementalSource } from '../../../types'
import type { BrowserRecord, InputData, InputState } from '../../../types'
import { getEventTarget } from '../eventsUtils'
import { MutationKind, getElementInputValue } from '../serialization'
import type { MutationTransaction, SerializationScope } from '../serialization'
import { assembleIncrementalSnapshot } from '../assembly'
import type { Tracker } from './tracker.types'

export function trackInput(scope: SerializationScope, target: Document | ShadowRoot): Tracker {
  const defaultPrivacyLevel = scope.configuration.defaultPrivacyLevel
  const lastInputStateMap: WeakMap<Node, InputState> = new WeakMap()

  const isShadowRoot = target !== document

  const { stop: stopEventListeners } = addEventListeners(
    scope.configuration,
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
    scope.captureMutation(MutationKind.INCREMENTAL, (transaction) => {
      const nodePrivacyLevel = getNodePrivacyLevel(target, defaultPrivacyLevel)
      if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
        return []
      }

      const type = target.type

      let inputState: InputState
      if (type === 'radio' || type === 'checkbox') {
        if (shouldMaskNode(target, nodePrivacyLevel)) {
          return []
        }
        inputState = { isChecked: (target as HTMLInputElement).checked }
      } else {
        const value = getElementInputValue(target, nodePrivacyLevel)
        if (value === undefined) {
          return []
        }
        inputState = { text: value }
      }

      const records: BrowserRecord[] = []

      // Can be multiple changes on the same node within the same batched mutation observation.
      const record = createRecordIfStateChanged(target, inputState, transaction)
      if (record) {
        records.push(record)
      }

      // If a radio was checked, other radios with the same name attribute will be unchecked.
      const name = target.name
      if (type === 'radio' && name && (target as HTMLInputElement).checked) {
        document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`).forEach((el: Element) => {
          if (el !== target) {
            // TODO: Consider the privacy implications for various differing input privacy levels
            const record = createRecordIfStateChanged(el, { isChecked: false }, transaction)
            if (record) {
              records.push(record)
            }
          }
        })
      }

      return records
    })
  }

  /**
   * There can be multiple changes on the same node within the same batched mutation observation.
   */
  function createRecordIfStateChanged(target: Node, inputState: InputState, transaction: MutationTransaction) {
    const id = transaction.scope.nodeIds.get(target)
    if (id === undefined) {
      return
    }
    const lastInputState = lastInputStateMap.get(target)
    if (
      !lastInputState ||
      (lastInputState as { text?: string }).text !== (inputState as { text?: string }).text ||
      (lastInputState as { isChecked?: boolean }).isChecked !== (inputState as { isChecked?: boolean }).isChecked
    ) {
      lastInputStateMap.set(target, inputState)
      return assembleIncrementalSnapshot<InputData>(IncrementalSource.Input, {
        id,
        ...inputState,
      })
    }
  }
}
