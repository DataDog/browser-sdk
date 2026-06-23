import type { RumConfiguration } from '@openobserve/browser-rum-core'
import { noop } from '@openobserve/browser-core'
import { createElementsScrollPositions } from '../elementsScrollPositions'
import type { RecordingScope } from '../recordingScope'
import { createRecordingScope } from '../recordingScope'
import type { AddShadowRootCallBack, RemoveShadowRootCallBack } from '../shadowRootsController'
import { DEFAULT_CONFIGURATION } from './rumConfiguration.specHelper'
import { DEFAULT_SHADOW_ROOT_CONTROLLER } from './shadowRootsController.specHelper'

export function createRecordingScopeForTesting({
  configuration,
  addShadowRoot,
  removeShadowRoot,
}: {
  configuration?: Partial<RumConfiguration>
  addShadowRoot?: AddShadowRootCallBack
  removeShadowRoot?: RemoveShadowRootCallBack
} = {}): RecordingScope {
  return createRecordingScope(
    (configuration as RumConfiguration) || { ...DEFAULT_CONFIGURATION },
    createElementsScrollPositions(),
    {
      ...DEFAULT_SHADOW_ROOT_CONTROLLER,
      addShadowRoot: addShadowRoot || noop,
      removeShadowRoot: removeShadowRoot || noop,
    }
  )
}
