import type { RumConfiguration } from '@datadog/browser-rum-core'

import type { ElementsScrollPositions } from './elementsScrollPositions'
import { createEventIds, createNodeIds, createStringIds, createStyleSheetIds } from './encoding'
import type { EventIds, NodeIds, StringIds, StyleSheetIds } from './encoding'
import type { ShadowRootsController } from './shadowRootsController'
import type { CanvasManager } from './canvas/canvasManager'

/**
 * State associated with a stream of session replay records. When a new stream of records
 * starts (e.g. because recording has shut down and restarted), a new RecordingScope
 * object must be created; this ensures that we don't generate records that reference ids
 * or data which aren't present in the current stream.
 */
export interface RecordingScope {
  resetIds(): void

  canvasManager: CanvasManager
  configuration: RumConfiguration
  elementsScrollPositions: ElementsScrollPositions
  eventIds: EventIds
  nodeIds: NodeIds
  /**
   * The `adoptedStyleSheets` of each serialized #document or #shadow-root node, as of
   * the last time they were serialized. Used to detect changes to `adoptedStyleSheets`
   * after a node has been serialized.
   */
  serializedAdoptedStyleSheets: Map<Document | ShadowRoot, CSSStyleSheet[]>
  shadowRootsController: ShadowRootsController
  stringIds: StringIds
  styleSheetIds: StyleSheetIds
}

export function createRecordingScope(
  canvasManager: CanvasManager,
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
      scope.serializedAdoptedStyleSheets.clear()
      scope.stringIds.clear()
      scope.styleSheetIds.clear()
      scope.canvasManager.reset()
    },

    canvasManager,
    configuration,
    elementsScrollPositions,
    eventIds,
    nodeIds,
    serializedAdoptedStyleSheets: new Map(),
    shadowRootsController,
    stringIds,
    styleSheetIds,
  }

  return scope
}
