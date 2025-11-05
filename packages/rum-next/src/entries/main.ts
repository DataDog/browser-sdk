import { createHandlingStack } from '@datadog/browser-core'
import { getInternalApi, MessageType } from '@datadog/browser-internal-next'
import type { AddDurationVitalOptions, DurationVitalOptions, DurationVitalReference } from '@datadog/browser-rum-core'

export function addError(error: unknown, options?: { context?: object }) {
  const handlingStack = createHandlingStack('error')
  getInternalApi().notify({
    type: MessageType.RUM_ERROR,
    error,
    context: options?.context,
    handlingStack,
  })
}

export function addAction(name: string, context?: object) {
  const handlingStack = createHandlingStack('error')
  getInternalApi().notify({
    type: MessageType.RUM_ACTION,
    name,
    context,
    handlingStack,
  })
}

export function addDurationVital(name: string, options: AddDurationVitalOptions) {
  getInternalApi().notify({
    type: MessageType.RUM_ADD_DURATION_VITAL,
    name,
    options,
  })
}

export function startDurationVital(name: string, options?: DurationVitalOptions): DurationVitalReference {
  const ref: DurationVitalReference = { __dd_vital_reference: true }
  getInternalApi().notify({
    type: MessageType.RUM_START_DURATION_VITAL,
    name,
    ref,
    options,
  })
  return ref
}

export function stopDurationVital(nameOrRef: string | DurationVitalReference, options?: DurationVitalOptions) {
  getInternalApi().notify({
    type: MessageType.RUM_STOP_DURATION_VITAL,
    nameOrRef,
    options,
  })
}
