import { timeStampNow } from '@datadog/browser-core'
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

  const elementsScrollPositions = createElementsScrollPositions()

  const mutationCb = (mutation: BrowserMutationPayload) => {
    emit(assembleIncrementalSnapshot<BrowserMutationData>(IncrementalSource.Mutation, mutation))
  }
  const inputCb: InputCallback = (s) => emit(assembleIncrementalSnapshot<InputData>(IncrementalSource.Input, s))

  const shadowRootsController = initShadowRootsController(configuration, { mutationCb, inputCb })

  const { stop: stopFullSnapshots } = startFullSnapshots(
    elementsScrollPositions,
    shadowRootsController,
    lifeCycle,
    configuration,
    flushMutations,
    (records) => records.forEach((record) => emit(record))
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
      emit(assembleIncrementalSnapshot<MediaInteractionData>(IncrementalSource.MediaInteraction, p)),
    mouseInteractionCb: (mouseInteractionRecord) => emit(mouseInteractionRecord),
    mousemoveCb: (positions, source) => emit(assembleIncrementalSnapshot<MousemoveData>(source, { positions })),
    mutationCb,
    scrollCb: (p) => emit(assembleIncrementalSnapshot<ScrollData>(IncrementalSource.Scroll, p)),
    styleSheetCb: (r) => emit(assembleIncrementalSnapshot<StyleSheetRuleData>(IncrementalSource.StyleSheetRule, r)),
    viewportResizeCb: (d) => emit(assembleIncrementalSnapshot<ViewportResizeData>(IncrementalSource.ViewportResize, d)),
    frustrationCb: (frustrationRecord) => emit(frustrationRecord),
    focusCb: (data) =>
      emit({
        data,
        type: RecordType.Focus,
        timestamp: timeStampNow(),
      }),
    visualViewportResizeCb: (data) => {
      emit({
        data,
        type: RecordType.VisualViewport,
        timestamp: timeStampNow(),
      })
    },
    viewEndCb: (viewEndRecord) => {
      flushMutations()
      emit(viewEndRecord)
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
