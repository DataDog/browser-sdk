import type { RumConfiguration } from '@datadog/browser-rum-core'

import type { ElementsScrollPositions } from './elementsScrollPositions'
import { createEventIds, createNodeIds, createStringIds, createStyleSheetIds } from './itemIds'
import type { EventIds, NodeIds, StringIds, StyleSheetIds } from './itemIds'
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
  stringIds: StringIds
  styleSheetIds: StyleSheetIds
}

export function createRecordingScope(
  configuration: RumConfiguration,
  elementsScrollPositions: ElementsScrollPositions,
  shadowRootsController: ShadowRootsController
): RecordingScope {
  const eventIds = createEventIds()
  const nodeIds = createNodeIds()
  const stringIds = createStringIds()
  const styleSheetIds = createStyleSheetIds()
  return {
    configuration,
    elementsScrollPositions,
    eventIds,
    nodeIds,
    shadowRootsController,
    stringIds,
    styleSheetIds,
  }
}
