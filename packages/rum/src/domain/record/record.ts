import { sendToExtension } from '@datadog/browser-core'
import type { LifeCycle, RumConfiguration, ViewHistory } from '@datadog/browser-rum-core'
import type { BrowserRecord } from '../../types'
import * as replayStats from '../replayStats'
import type { Tracker } from './trackers'
import {
  trackFocus,
  trackFrustration,
  trackInput,
  trackMediaInteraction,
  trackMouseInteraction,
  trackMove,
  trackMutation,
  trackScroll,
  trackStyleSheet,
  trackViewEnd,
  trackViewportResize,
  trackVisualViewportResize,
} from './trackers'
import { createElementsScrollPositions } from './elementsScrollPositions'
import type { ShadowRootsController } from './shadowRootsController'
import { initShadowRootsController } from './shadowRootsController'
import { startFullSnapshots } from './startFullSnapshots'
import { createEventIds } from './eventIds'
import type { SerializationStats } from './serialization'
import { createSerializationScope } from './serialization'
import { createNodeIds } from './nodeIds'

export interface RecordOptions {
  emit?: (record: BrowserRecord, stats?: SerializationStats) => void
  configuration: RumConfiguration
  lifeCycle: LifeCycle
  viewHistory: ViewHistory
}

export interface RecordAPI {
  stop: () => void
  flushMutations: () => void
  shadowRootsController: ShadowRootsController
}

export function record(options: RecordOptions): RecordAPI {
  const { emit, configuration, lifeCycle } = options
  // runtime checks for user options
  if (!emit) {
    throw new Error('emit function is required')
  }

  const emitAndComputeStats = (record: BrowserRecord, stats?: SerializationStats) => {
    emit(record, stats)
    sendToExtension('record', { record })
    const view = options.viewHistory.findView()!
    replayStats.addRecord(view.id)
  }

  const shadowRootsController = initShadowRootsController()
  const scope = createSerializationScope(
    configuration,
    createElementsScrollPositions(),
    emitAndComputeStats,
    createEventIds(),
    createNodeIds(),
    shadowRootsController
  )

  const { stop: stopFullSnapshots } = startFullSnapshots(lifeCycle, scope, flushMutations)

  function flushMutations() {
    shadowRootsController.flush()
    mutationTracker.flush()
  }

  const mutationTracker = trackMutation(scope, document)
  const trackers: Tracker[] = [
    mutationTracker,
    trackMove(scope),
    trackMouseInteraction(scope),
    trackScroll(scope, document),
    trackViewportResize(scope),
    trackInput(scope, document),
    trackMediaInteraction(scope),
    trackStyleSheet(scope),
    trackFocus(scope),
    trackVisualViewportResize(scope),
    trackFrustration(lifeCycle, scope),
    trackViewEnd(lifeCycle, scope, flushMutations),
  ]

  return {
    stop: () => {
      shadowRootsController.stop()
      trackers.forEach((tracker) => tracker.stop())
      stopFullSnapshots()
    },
    flushMutations,
    shadowRootsController,
  }
}
