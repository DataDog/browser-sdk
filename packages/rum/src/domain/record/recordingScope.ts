import type { RumConfiguration } from '@datadog/browser-rum-core'

import type { ElementsScrollPositions } from './elementsScrollPositions'
import type { EventIds } from './eventIds'
import type { NodeIds } from './nodeIds'
import type { ShadowRootsController } from './shadowRootsController'

/**
 * State associated with a stream of session replay records. When a new stream of records
 * starts (e.g. because recording has shut down and restarted), a new RecordingScope
 * object must be created; this ensures that we don't generate records that reference ids
 * or data which aren't present in the current stream.
 */
export interface RecordingScope {
  configuration: RumConfiguration
  elementsScrollPositions: ElementsScrollPositions
  eventIds: EventIds
  nodeIds: NodeIds
  shadowRootsController: ShadowRootsController
}

export function createRecordingScope(
  configuration: RumConfiguration,
  elementsScrollPositions: ElementsScrollPositions,
  eventIds: EventIds,
  nodeIds: NodeIds,
  shadowRootsController: ShadowRootsController
): RecordingScope {
  return {
    configuration,
    elementsScrollPositions,
    eventIds,
    nodeIds,
    shadowRootsController,
  }
}
