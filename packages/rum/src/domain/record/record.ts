import { sendToExtension } from '@datadog/browser-core'
import type { LifeCycle, RumConfiguration, ViewHistory } from '@datadog/browser-rum-core'
import * as replayStats from '../replayStats'
import type { BrowserRecord } from '../../types'
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
import { initRecordIds } from './recordIds'
import type { EmitRecordCallback, EmitStatsCallback } from './record.types'
import { createSerializationScope } from './serialization'
import { createNodeIds } from './nodeIds'

export interface RecordOptions {
  emitRecord: EmitRecordCallback
  emitStats: EmitStatsCallback
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
  const { emitRecord, emitStats, configuration, lifeCycle } = options
  // runtime checks for user options
  if (!emitRecord || !emitStats) {
    throw new Error('emit functions are required')
  }

  const processRecord: EmitRecordCallback = (record: BrowserRecord) => {
    emitRecord(record)
    sendToExtension('record', { record })
    const view = options.viewHistory.findView()!
    replayStats.addRecord(view.id)
  }

  const elementsScrollPositions = createElementsScrollPositions()
  const scope = createSerializationScope(createNodeIds())
  const shadowRootsController = initShadowRootsController(
    configuration,
    scope,
    processRecord,
    emitStats,
    elementsScrollPositions
  )

  const { stop: stopFullSnapshots } = startFullSnapshots(
    elementsScrollPositions,
    shadowRootsController,
    lifeCycle,
    configuration,
    scope,
    flushMutations,
    processRecord,
    emitStats
  )

  function flushMutations() {
    shadowRootsController.flush()
    mutationTracker.flush()
  }

  const recordIds = initRecordIds()
  const mutationTracker = trackMutation(processRecord, emitStats, configuration, scope, shadowRootsController, document)
  const trackers: Tracker[] = [
    mutationTracker,
    trackMove(configuration, scope, processRecord),
    trackMouseInteraction(configuration, scope, processRecord, recordIds),
    trackScroll(configuration, scope, processRecord, elementsScrollPositions, document),
    trackViewportResize(configuration, processRecord),
    trackInput(configuration, scope, processRecord),
    trackMediaInteraction(configuration, scope, processRecord),
    trackStyleSheet(scope, processRecord),
    trackFocus(configuration, processRecord),
    trackVisualViewportResize(configuration, processRecord),
    trackFrustration(lifeCycle, processRecord, recordIds),
    trackViewEnd(lifeCycle, flushMutations, processRecord),
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
