import { sendToExtension, timeStampNow } from '@datadog/browser-core'
import type { LifeCycle, RumConfiguration, ViewContexts } from '@datadog/browser-rum-core'
import type {
  BrowserMutationData,
  BrowserMutationPayload,
  BrowserRecord,
  InputData,
  MediaInteractionData,
  MousemoveData,
  ScrollData,
  StyleSheetRuleData,
  ViewportResizeData,
} from '../../types'
import { RecordType, IncrementalSource } from '../../types'
import * as replayStats from '../replayStats'
import { assembleIncrementalSnapshot } from './assembly'
import { initObservers } from './observers'
import { createElementsScrollPositions } from './elementsScrollPositions'
import type { ShadowRootsController } from './shadowRootsController'
import { initShadowRootsController } from './shadowRootsController'
import type { InputCallback } from './observers'
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

  const mutationCb = (mutation: BrowserMutationPayload) => {
    emitAndComputeStats(assembleIncrementalSnapshot<BrowserMutationData>(IncrementalSource.Mutation, mutation))
  }
  const inputCb: InputCallback = (s) =>
    emitAndComputeStats(assembleIncrementalSnapshot<InputData>(IncrementalSource.Input, s))

  const shadowRootsController = initShadowRootsController(configuration, { mutationCb, inputCb })

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
    configuration,
    elementsScrollPositions,
    inputCb,
    mediaInteractionCb: (p) =>
      emitAndComputeStats(assembleIncrementalSnapshot<MediaInteractionData>(IncrementalSource.MediaInteraction, p)),
    mouseInteractionCb: (mouseInteractionRecord) => emitAndComputeStats(mouseInteractionRecord),
    mousemoveCb: (positions, source) =>
      emitAndComputeStats(assembleIncrementalSnapshot<MousemoveData>(source, { positions })),
    mutationCb,
    scrollCb: (p) => emitAndComputeStats(assembleIncrementalSnapshot<ScrollData>(IncrementalSource.Scroll, p)),
    styleSheetCb: (r) =>
      emitAndComputeStats(assembleIncrementalSnapshot<StyleSheetRuleData>(IncrementalSource.StyleSheetRule, r)),
    viewportResizeCb: (d) =>
      emitAndComputeStats(assembleIncrementalSnapshot<ViewportResizeData>(IncrementalSource.ViewportResize, d)),
    frustrationCb: (frustrationRecord) => emitAndComputeStats(frustrationRecord),
    focusCb: (data) =>
      emitAndComputeStats({
        data,
        type: RecordType.Focus,
        timestamp: timeStampNow(),
      }),
    visualViewportResizeCb: (data) => {
      emitAndComputeStats({
        data,
        type: RecordType.VisualViewport,
        timestamp: timeStampNow(),
      })
    },
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
