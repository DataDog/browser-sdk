import { instrumentSetter, DOM_EVENT, addEventListeners, noop } from '@datadog/browser-core'
import { timeStampNow } from '@datadog/js-core/time'
import { NodePrivacyLevel, getNodePrivacyLevel, shouldMaskNode } from '@datadog/browser-rum-core'
import { InputSelectionState } from '../../../types'
import { getEventTarget } from '../eventsUtils'
import type { NodeId } from '../itemIds'
import type { RecordingScope } from '../recordingScope'
import type { SerializationTransaction } from '../serialization'
import { getElementInputValue, SerializationKind, serializeInTransaction } from '../serialization'
import type { EmitRecordCallback, EmitStatsCallback } from '../record.types'
import type { Tracker } from './tracker.types'

const enum InputStateType {
  VALUE,
  SELECTION,
}

/**
 * The state of a form element: either a value, for an element whose state can be
 * reconstructed from its `value` property, or a selection state, for an element the user
 * selects rather than fills in.
 */
type InputState =
  { type: InputStateType.VALUE; value: string } | { type: InputStateType.SELECTION; selection: InputSelectionState }

/** The state every radio button of a group but the selected one changes to. */
const DESELECTED_INPUT_STATE: InputState = {
  type: InputStateType.SELECTION,
  selection: InputSelectionState.Deselected,
}

export function trackInput(
  target: Document | ShadowRoot,
  emitRecord: EmitRecordCallback,
  emitStats: EmitStatsCallback,
  scope: RecordingScope
): Tracker {
  const defaultPrivacyLevel = scope.configuration.defaultPrivacyLevel
  const lastInputStateMap: WeakMap<Node, InputState> = new WeakMap()

  const isShadowRoot = target.nodeType !== target.DOCUMENT_NODE

  const targetGlobal = (isShadowRoot ? (target as ShadowRoot).ownerDocument : (target as Document)).defaultView
  if (!targetGlobal) {
    // A document with no global object, such as one created by DOMParser, produces no input events.
    return { stop: noop }
  }

  const { stop: stopEventListeners } = addEventListeners(
    target,
    // The 'input' event bubbles across shadow roots, so we don't have to listen for it on shadow
    // roots since it will be handled by the event listener that we did add to the document. Only
    // the 'change' event is blocked and needs to be handled on shadow roots.
    isShadowRoot ? [DOM_EVENT.CHANGE] : [DOM_EVENT.INPUT, DOM_EVENT.CHANGE],
    (event) => {
      const target = getEventTarget(event)
      if (
        target instanceof targetGlobal.HTMLInputElement ||
        target instanceof targetGlobal.HTMLTextAreaElement ||
        target instanceof targetGlobal.HTMLSelectElement
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
      instrumentSetter(targetGlobal.HTMLInputElement.prototype, 'value', onElementChange),
      instrumentSetter(targetGlobal.HTMLInputElement.prototype, 'checked', onElementChange),
      instrumentSetter(targetGlobal.HTMLSelectElement.prototype, 'value', onElementChange),
      instrumentSetter(targetGlobal.HTMLTextAreaElement.prototype, 'value', onElementChange),
      instrumentSetter(targetGlobal.HTMLSelectElement.prototype, 'selectedIndex', onElementChange),
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

    // The changed node. Usually the target; for <select>, the now-selected <option>.
    let changedNode: Node = target
    let inputState: InputState
    if (type === 'radio' || type === 'checkbox') {
      if (shouldMaskNode(target, nodePrivacyLevel)) {
        return
      }
      inputState = { type: InputStateType.SELECTION, selection: selectionStateOf(target as HTMLInputElement) }
    } else if (isSelectElement(target)) {
      if (shouldMaskNode(target, nodePrivacyLevel)) {
        return
      }
      // TODO: Record every selected <option> of a <select multiple>, not just the first.
      const selectedOption = target.options[target.selectedIndex]
      if (!selectedOption) {
        return
      }
      changedNode = selectedOption
      inputState = { type: InputStateType.SELECTION, selection: InputSelectionState.Selected }
    } else {
      const value = getElementInputValue(target, nodePrivacyLevel)
      if (value === undefined) {
        return
      }
      inputState = { type: InputStateType.VALUE, value }
    }

    const changedNodeId = affectedNodeIdForChange(changedNode, inputState)

    // Selecting a radio button deselects every other radio button in its group.
    const deselectedNodeIds: NodeId[] = []
    if (type === 'radio' && (target as HTMLInputElement).checked) {
      forEachOtherRadioInGroup(target as HTMLInputElement, (radio: HTMLInputElement) => {
        // TODO: Consider the privacy implications for various differing input privacy levels
        const deselectedNodeId = affectedNodeIdForChange(radio, DESELECTED_INPUT_STATE)
        if (deselectedNodeId !== undefined) {
          deselectedNodeIds.push(deselectedNodeId)
        }
      })
    }

    if (isSelectElement(target)) {
      // Update the state of now-deselected options.
      // TODO: Record the deselections once <select multiple> is supported.
      for (let i = 0; i < target.options.length; i++) {
        const option = target.options[i]
        if (option !== changedNode) {
          lastInputStateMap.delete(option)
        }
      }
    }

    if (changedNodeId === undefined && deselectedNodeIds.length === 0) {
      return
    }

    serializeInTransaction(
      SerializationKind.INCREMENTAL_SNAPSHOT,
      emitRecord,
      emitStats,
      scope,
      timeStampNow(),
      (transaction: SerializationTransaction) => {
        if (changedNodeId !== undefined) {
          if (inputState.type === InputStateType.VALUE) {
            transaction.setInputValue(changedNodeId, inputState.value)
          } else {
            transaction.setInputSelection(inputState.selection, [changedNodeId])
          }
        }
        if (deselectedNodeIds.length > 0) {
          transaction.setInputSelection(InputSelectionState.Deselected, deselectedNodeIds)
        }
      }
    )
  }

  /**
   * Given a form input change, returns the affected node id, if any. It's possible for
   * there to be no affected node id if the change was redundant, or if the node has not
   * yet been snapshotted (in which case a future snapshot will pick up the change
   * instead), or if the node is not being recorded due to its privacy level.
   */
  function affectedNodeIdForChange(target: Node, inputState: InputState): NodeId | undefined {
    const id = scope.nodeIds.get(target)
    if (id === undefined) {
      return undefined
    }
    const lastInputState = lastInputStateMap.get(target)
    if (lastInputState && isSameInputState(lastInputState, inputState)) {
      return undefined
    }
    lastInputStateMap.set(target, inputState)
    return id
  }
}

function isSelectElement(element: Element): element is HTMLSelectElement {
  return element.tagName === 'SELECT'
}

/** The selection state of a checkbox or radio button. */
function selectionStateOf(input: HTMLInputElement): InputSelectionState {
  // TODO: Record indeterminate checkboxes as InputSelectionState.Indeterminate.
  return input.checked ? InputSelectionState.Selected : InputSelectionState.Deselected
}

/** Runs the given callback for every other radio button in the same group as the given one. */
function forEachOtherRadioInGroup(radio: HTMLInputElement, callback: (radio: HTMLInputElement) => void): void {
  if (!radio.name) {
    // A radio button with no name isn't part of a group at all.
    return
  }

  // TODO: Correctly scope by form and shadow tree.
  radio.ownerDocument
    .querySelectorAll(`input[type="radio"][name="${CSS.escape(radio.name)}"]`)
    .forEach((element: Element) => {
      const otherRadio = element as HTMLInputElement
      if (otherRadio !== radio) {
        callback(otherRadio)
      }
    })
}

function isSameInputState(a: InputState, b: InputState): boolean {
  if (a.type === InputStateType.VALUE) {
    return b.type === InputStateType.VALUE && a.value === b.value
  }
  return b.type === InputStateType.SELECTION && a.selection === b.selection
}
