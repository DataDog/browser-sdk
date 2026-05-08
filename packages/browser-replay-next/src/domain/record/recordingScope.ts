import type { ReplayConfig } from '../configuration'
import type { ElementsScrollPositions } from './elementsScrollPositions'
import { createEventIds, createNodeIds, createStringIds, createStyleSheetIds } from './itemIds'
import type { EventIds, NodeIds, StringIds, StyleSheetIds } from './itemIds'
import type { ShadowRootsController } from './shadowRootsController'
import type { SerializeEvent } from './record.types'

// Minimal Observable implementation — mirrors the browser-core Observable API
export class Observable<T> {
  private subscribers: Array<(value: T) => void> = []

  subscribe(subscriber: (value: T) => void): { unsubscribe: () => void } {
    this.subscribers.push(subscriber)
    return {
      unsubscribe: () => {
        this.subscribers = this.subscribers.filter((s) => s !== subscriber)
      },
    }
  }

  notify(value: T): void {
    for (const subscriber of this.subscribers) {
      subscriber(value)
    }
  }
}

/**
 * State associated with a stream of session replay records. When a new stream of records
 * starts (e.g. because recording has shut down and restarted), a new RecordingScope
 * object must be created; this ensures that we don't generate records that reference ids
 * or data which aren't present in the current stream.
 */
export interface RecordingScope {
  resetIds(): void

  configuration: ReplayConfig
  elementsScrollPositions: ElementsScrollPositions
  eventIds: EventIds
  nodeIds: NodeIds
  serializeObservable: Observable<SerializeEvent>
  shadowRootsController: ShadowRootsController
  stringIds: StringIds
  styleSheetIds: StyleSheetIds
}

export function createRecordingScope(
  configuration: ReplayConfig,
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
