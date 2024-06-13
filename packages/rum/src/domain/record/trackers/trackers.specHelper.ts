import { noop } from '@datadog/browser-core'
import { NodePrivacyLevel } from '@datadog/browser-rum-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { ShadowRootsController } from '../shadowRootsController'

export const DEFAULT_SHADOW_ROOT_CONTROLLER: ShadowRootsController = {
  flush: noop,
  stop: noop,
  addShadowRoot: noop,
  removeShadowRoot: noop,
}
export const DEFAULT_CONFIGURATION = { defaultPrivacyLevel: NodePrivacyLevel.ALLOW } as RumConfiguration
