import type { RumConfiguration } from '@datadog/browser-rum-core'

import { Observable } from '@datadog/browser-core'
import type { ElementsScrollPositions } from './elementsScrollPositions'
import { createEventIds, createNodeIds, createStringIds, createStyleSheetIds } from './itemIds'
import type { EventIds, NodeIds, StringIds, StyleSheetIds } from './itemIds'
import type { ShadowRootsController } from './shadowRootsController'
import type { SerializeEvent } from './record.types'

/**
 * State associated with a stream of session replay records. When a new stream of records
 * starts (e.g. because recording has shut down and restarted), a new RecordingScope
 * object must be created; this ensures that we don't generate records that reference ids
 * or data which aren't present in the current stream.
 */
export interface RecordingScope {
  resetIds(): void

  configuration: RumConfiguration
  elementsScrollPositions: ElementsScrollPositions
  eventIds: EventIds
  nodeIds: NodeIds
  serializeObservable: Observable<SerializeEvent>
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

  const scope: RecordingScope = {
    resetIds(): void {
      scope.eventIds.clear()
      scope.nodeIds.clear()
      scope.stringIds.clear()
      scope.styleSheetIds.clear()
    },

    configuration,
    elementsScrollPositions,
    eventIds,
    nodeIds,
    serializeObservable: new Observable<SerializeEvent>(),
    shadowRootsController,
    stringIds,
    styleSheetIds,
  }

  return scope
}
