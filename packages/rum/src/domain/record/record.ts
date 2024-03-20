import { sendToExtension } from '@datadog/browser-core'
import type { LifeCycle, RumConfiguration, ViewContexts } from '@datadog/browser-rum-core'
import type { BrowserRecord } from '../../types'
import * as replayStats from '../replayStats'
import {
  initFocusObserver,
  initFrustrationObserver,
  initInputObserver,
  initMediaInteractionObserver,
  initMouseInteractionObserver,
  initMoveObserver,
  initMutationObserver,
  initRecordIds,
  initScrollObserver,
  initStyleSheetObserver,
  initViewEndObserver,
  initViewportResizeObserver,
  initVisualViewportResizeObserver,
} from './observers'
import { createElementsScrollPositions } from './elementsScrollPositions'
import type { ShadowRootsController } from './shadowRootsController'
import { initShadowRootsController } from './shadowRootsController'
import { startFullSnapshots } from './startFullSnapshots'

export interface RecordOptions {
  emit?: (record: BrowserRecord) => void
  configuration: RumConfiguration
  lifeCycle: LifeCycle
  viewContexts: ViewContexts
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

  const emitAndComputeStats = (record: BrowserRecord) => {
    emit(record)
    sendToExtension('record', { record })
    const view = options.viewContexts.findView()!
    replayStats.addRecord(view.id)
  }

  const elementsScrollPositions = createElementsScrollPositions()

  const shadowRootsController = initShadowRootsController(configuration, {
    mutationCb: emitAndComputeStats,
    inputCb: emitAndComputeStats,
  })

  const { stop: stopFullSnapshots } = startFullSnapshots(
    elementsScrollPositions,
    shadowRootsController,
    lifeCycle,
    configuration,
    flushMutations,
    (records) => records.forEach((record) => emitAndComputeStats(record))
  )

  function flushMutations() {
    shadowRootsController.flush()
    mutationObserver.flush()
  }

  const recordIds = initRecordIds()
  const mutationObserver = initMutationObserver(emitAndComputeStats, configuration, shadowRootsController, document)
  const observers = [
    mutationObserver,
    initMoveObserver(configuration, emitAndComputeStats),
    initMouseInteractionObserver(configuration, emitAndComputeStats, recordIds),
    initScrollObserver(configuration, emitAndComputeStats, elementsScrollPositions),
    initViewportResizeObserver(configuration, emitAndComputeStats),
    initInputObserver(configuration, emitAndComputeStats),
    initMediaInteractionObserver(configuration, emitAndComputeStats),
    initStyleSheetObserver(emitAndComputeStats),
    initFocusObserver(configuration, emitAndComputeStats),
    initVisualViewportResizeObserver(configuration, emitAndComputeStats),
    initFrustrationObserver(lifeCycle, emitAndComputeStats, recordIds),
    initViewEndObserver(lifeCycle, (viewEndRecord) => {
      flushMutations()
      emitAndComputeStats(viewEndRecord)
    }),
  ]

  return {
    stop: () => {
      shadowRootsController.stop()
      observers.forEach((observer) => observer.stop())
      stopFullSnapshots()
    },
    flushMutations,
    shadowRootsController,
  }
}
