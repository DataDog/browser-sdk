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
import type { EmitRecordCallback, EmitStatsCallback } from './record.types'
import { createRecordingScope } from './recordingScope'

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

  const shadowRootsController = initShadowRootsController(processRecord, emitStats)
  const scope = createRecordingScope(configuration, createElementsScrollPositions(), shadowRootsController)

  const { stop: stopFullSnapshots } = startFullSnapshots(lifeCycle, processRecord, emitStats, flushMutations, scope)

  function flushMutations() {
    shadowRootsController.flush()
    mutationTracker.flush()
  }

  const mutationTracker = trackMutation(document, processRecord, emitStats, scope)
  const trackers: Tracker[] = [
    mutationTracker,
    trackMove(processRecord, scope),
    trackMouseInteraction(processRecord, scope),
    trackScroll(document, processRecord, scope),
    trackViewportResize(processRecord, scope),
    trackInput(document, processRecord, scope),
    trackMediaInteraction(processRecord, scope),
    trackStyleSheet(processRecord, scope),
    trackFocus(processRecord, scope),
    trackVisualViewportResize(processRecord, scope),
    trackFrustration(lifeCycle, processRecord, scope),
    trackViewEnd(lifeCycle, processRecord, flushMutations),
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
