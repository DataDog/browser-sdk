import { sendToExtension } from '@datadog/browser-core'
import type { LifeCycle, RumConfiguration, ViewContexts } from '@datadog/browser-rum-core'
import type { BrowserRecord } from '../../types'
import * as replayStats from '../replayStats'
import { initObservers } from './observers'
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
    flushMutationsFromObservers()
  }

  const { stop: stopObservers, flush: flushMutationsFromObservers } = initObservers(configuration, {
    lifeCycle: options.lifeCycle,
    elementsScrollPositions,
    inputCb: emitAndComputeStats,
    mediaInteractionCb: emitAndComputeStats,
    mouseInteractionCb: emitAndComputeStats,
    mousemoveCb: emitAndComputeStats,
    mutationCb: emitAndComputeStats,
    scrollCb: emitAndComputeStats,
    styleSheetCb: emitAndComputeStats,
    viewportResizeCb: emitAndComputeStats,
    frustrationCb: emitAndComputeStats,
    focusCb: emitAndComputeStats,
    visualViewportResizeCb: emitAndComputeStats,
    viewEndCb: (viewEndRecord) => {
      flushMutations()
      emitAndComputeStats(viewEndRecord)
    },
    shadowRootsController,
  })

  return {
    stop: () => {
      shadowRootsController.stop()
      stopObservers()
      stopFullSnapshots()
    },
    flushMutations,
    shadowRootsController,
  }
}
