import type { ReplayConfig } from '../configuration'
import type { BrowserRecord } from '../../types/sessionReplay'
import type { Tracker } from './trackers'
import {
  trackFocus,
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
import type { ViewEndTracker } from './trackers/trackViewEnd'
import { createElementsScrollPositions } from './elementsScrollPositions'
import { initShadowRootsController } from './shadowRootsController'
import { startFullSnapshots } from './startFullSnapshots'
import type { EmitRecordCallback, EmitStatsCallback } from './record.types'
import { createRecordingScope } from './recordingScope'

export interface RecorderOptions {
  document: Document
  configuration: ReplayConfig
  emitRecord: EmitRecordCallback
  emitStats: EmitStatsCallback
}

export interface RecorderAPI {
  stop: () => void
  flushMutations: () => void
}

export function startRecorder(options: RecorderOptions): RecorderAPI {
  const { emitRecord, emitStats, configuration } = options

  const shadowRootsController = initShadowRootsController(emitRecord, emitStats)
  const scope = createRecordingScope(configuration, createElementsScrollPositions(), shadowRootsController)

  function flushMutations() {
    shadowRootsController.flush()
    mutationTracker.flush()
  }

  const { stop: stopFullSnapshots } = startFullSnapshots(emitRecord, emitStats, flushMutations, scope)

  const mutationTracker = trackMutation(document, emitRecord, emitStats, scope)
  const viewEndTracker = trackViewEnd(emitRecord, flushMutations) as ViewEndTracker

  const trackers: Tracker[] = [
    mutationTracker,
    trackMove(emitRecord, scope),
    trackMouseInteraction(emitRecord, scope),
    trackScroll(document, emitRecord, scope),
    trackViewportResize(emitRecord, scope),
    trackInput(document, emitRecord, scope),
    trackMediaInteraction(emitRecord, scope),
    trackStyleSheet(emitRecord, scope),
    trackFocus(emitRecord, scope),
    trackVisualViewportResize(emitRecord, scope),
    viewEndTracker,
  ]

  return {
    stop: () => {
      shadowRootsController.stop()
      trackers.forEach((tracker) => tracker.stop())
      stopFullSnapshots()
    },
    flushMutations,
  }
}
