import { noop } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { ShadowRootsController } from '../shadowRootsController'
import { NodePrivacyLevel } from '../../../constants'

export const DEFAULT_SHADOW_ROOT_CONTROLLER: ShadowRootsController = {
  addShadowRoot: noop,
  removeShadowRoot: noop,
  stop: noop,
  flush: noop,
}
export const DEFAULT_CONFIGURATION = { defaultPrivacyLevel: NodePrivacyLevel.ALLOW } as RumConfiguration
