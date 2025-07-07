import type { DISCARDED, HookNamesAsConst, RecursivePartialExcept, RelativeTime, SKIPPED } from '@datadog/browser-core'
import { abstractHooks } from '@datadog/browser-core'
import type { ExposureEvent } from '../exposureEvent.types'

export type DefaultExposureEventAttributes = RecursivePartialExcept<ExposureEvent>

export type HookCallbackMap = {
  [HookNamesAsConst.ASSEMBLE]: (param: { startTime: RelativeTime }) => DefaultExposureEventAttributes | SKIPPED | DISCARDED
}

export type Hooks = ReturnType<typeof createHooks>

export const createHooks = abstractHooks<HookCallbackMap, DefaultExposureEventAttributes> 