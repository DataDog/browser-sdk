import { Observable, sendToExtension } from '@datadog/browser-core'
import type { LifeCycle, RumConfiguration, ViewHistory } from '@datadog/browser-rum-core'
import * as replayStats from '../replayStats'
import type { BrowserRecord } from '../../types'
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
  trackCanvas2DMutations,
  markCanvasAndDescendantsDirty,
} from './trackers'
import { createElementsScrollPositions } from './elementsScrollPositions'
import type { ShadowRootsController } from './shadowRootsController'
import { initShadowRootsController } from './shadowRootsController'
import { startFullSnapshots } from './startFullSnapshots'
import type { EmitRecordCallback, EmitStatsCallback } from './record.types'
import { createRecordingScope } from './recordingScope'
import { createCanvasManager } from './canvas/canvasManager'
import type { CapturedCanvasImage } from './canvas/canvasCapture'
import { startCanvasCapture } from './canvas/canvasCapture'

export interface RecordOptions {
  emitRecord: EmitRecordCallback
  emitStats: EmitStatsCallback
  configuration: RumConfiguration
  lifeCycle: LifeCycle
  viewHistory: ViewHistory
}

export interface RecordAPI {
  canvasImageObservable: Observable<CapturedCanvasImage>
  stop: () => void
  flushMutations: () => void
  shadowRootsController: ShadowRootsController
}

export function record(options: RecordOptions): RecordAPI {
  const { emitRecord, emitStats, configuration, lifeCycle } = options
  const canvasImageObservable = new Observable<CapturedCanvasImage>()
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

  const canvasCaptureConfiguration = configuration.sessionReplayCanvasRecording
  const canvasManager = canvasCaptureConfiguration?.enable ? createCanvasManager() : undefined

  const shadowRootsController = initShadowRootsController(processRecord, emitStats)
  const scope = createRecordingScope(
    configuration,
    createElementsScrollPositions(),
    shadowRootsController,
    canvasManager
  )

  let resetCanvasCapture: (() => void) | undefined

  const { stop: stopFullSnapshots } = startFullSnapshots(
    lifeCycle,
    processRecord,
    emitStats,
    flushMutations,
    scope,
    () => {
      resetCanvasCapture?.()
      if (canvasManager) {
        markCanvasAndDescendantsDirty(document, canvasManager)
      }
    }
  )

  // Seed all connected canvases after the initial full snapshot.
  if (canvasManager) {
    markCanvasAndDescendantsDirty(document, canvasManager)
  }

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
    trackViewportResize(processRecord),
    trackInput(document, processRecord, scope),
    trackMediaInteraction(processRecord, scope),
    trackStyleSheet(processRecord, scope),
    trackFocus(processRecord),
    trackVisualViewportResize(processRecord),
    trackViewEnd(lifeCycle, processRecord, flushMutations),
  ]

  if (canvasCaptureConfiguration && canvasManager) {
    markCanvasAndDescendantsDirty(document, canvasManager)
    const canvasCapture = startCanvasCapture(
      canvasManager,
      { ...canvasCaptureConfiguration, defaultPrivacyLevel: configuration.defaultPrivacyLevel },
      (image) => canvasImageObservable.notify(image)
    )
    resetCanvasCapture = canvasCapture.reset
    trackers.push(trackCanvas2DMutations(canvasManager.markCanvasDirty), canvasCapture)
  }

  return {
    canvasImageObservable,
    stop: () => {
      shadowRootsController.stop()
      trackers.forEach((tracker) => tracker.stop())
      stopFullSnapshots()
    },
    flushMutations,
    shadowRootsController,
  }
}
