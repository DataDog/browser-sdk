import { noop } from '@datadog/browser-core'
import type { ShadowRootsController } from '../shadowRootsController'

export const DEFAULT_SHADOW_ROOT_CONTROLLER: ShadowRootsController = {
  flush: noop,
  stop: noop,
  addShadowRoot: noop,
  removeShadowRoot: noop,
}
