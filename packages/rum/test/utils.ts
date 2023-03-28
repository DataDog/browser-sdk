import { noop } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { NodePrivacyLevel } from '../src/constants'
import type { ShadowRootsController } from '../src/domain/record'

/**
 * Simplify asserting record lengths across multiple devices when not all record types are supported
 */
export const recordsPerFullSnapshot = () =>
  // Meta, Focus, FullSnapshot, VisualViewport (support limited)
  window.visualViewport ? 4 : 3

export const DEFAULT_SHADOW_ROOT_CONTROLLER: ShadowRootsController = {
  flush: noop,
  stop: noop,
  addShadowRoot: noop,
  removeShadowRoot: noop,
}

export const DEFAULT_CONFIGURATION = { defaultPrivacyLevel: NodePrivacyLevel.ALLOW } as RumConfiguration
