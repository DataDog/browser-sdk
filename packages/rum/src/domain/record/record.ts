import type { TimeStamp } from '@datadog/browser-core'
import { timeStampNow } from '@datadog/browser-core'
import type { LifeCycle, RumConfiguration } from '@datadog/browser-rum-core'
import { getViewportDimension, getScrollX, getScrollY } from '@datadog/browser-rum-core'
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
import { SerializationContextStatus, serializeDocument } from './serialization'
import { initObservers } from './observers'
import { getVisualViewport } from './viewports'
import { createElementsScrollPositions } from './elementsScrollPositions'
import type { ShadowRootsController } from './shadowRootsController'
import { initShadowRootsController } from './shadowRootsController'
import type { InputCallback } from './observers'

export interface RecordOptions {
  emit?: (record: BrowserRecord) => void
  configuration: RumConfiguration
  lifeCycle: LifeCycle
}

export interface RecordAPI {
  stop: () => void
  takeSubsequentFullSnapshot: (timestamp?: TimeStamp) => void
  flushMutations: () => void
  shadowRootsController: ShadowRootsController
}

export function record(options: RecordOptions): RecordAPI {
  const { emit } = options
  // runtime checks for user options
  if (!emit) {
    throw new Error('emit function is required')
  }

  const elementsScrollPositions = createElementsScrollPositions()

  const mutationCb = (mutation: BrowserMutationPayload) => {
    emit(assembleIncrementalSnapshot<BrowserMutationData>(IncrementalSource.Mutation, mutation))
  }
  const inputCb: InputCallback = (s) => emit(assembleIncrementalSnapshot<InputData>(IncrementalSource.Input, s))

  const shadowRootsController = initShadowRootsController(options.configuration, { mutationCb, inputCb })

  const takeFullSnapshot = (
    timestamp = timeStampNow(),
    serializationContext = {
      status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT,
      elementsScrollPositions,
      shadowRootsController,
    }
  ) => {
    const { width, height } = getViewportDimension()
    emit({
      data: {
        height,
        href: window.location.href,
        width,
      },
      type: RecordType.Meta,
      timestamp,
    })

    emit({
      data: {
        has_focus: document.hasFocus(),
      },
      type: RecordType.Focus,
      timestamp,
    })

    emit({
      data: {
        node: serializeDocument(document, options.configuration, serializationContext),
        initialOffset: {
          left: getScrollX(),
          top: getScrollY(),
        },
      },
      type: RecordType.FullSnapshot,
      timestamp,
    })

    if (window.visualViewport) {
      emit({
        data: getVisualViewport(window.visualViewport),
        type: RecordType.VisualViewport,
        timestamp,
      })
    }
  }

  takeFullSnapshot()

  const { stop: stopObservers, flush: flushMutationsFromObservers } = initObservers({
    lifeCycle: options.lifeCycle,
    configuration: options.configuration,
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
    shadowRootsController,
  })

  function flushMutations() {
    shadowRootsController.flush()
    flushMutationsFromObservers()
  }

  return {
    stop: () => {
      shadowRootsController.stop()
      stopObservers()
    },
    takeSubsequentFullSnapshot: (timestamp) => {
      flushMutations()
      takeFullSnapshot(timestamp, {
        shadowRootsController,
        status: SerializationContextStatus.SUBSEQUENT_FULL_SNAPSHOT,
        elementsScrollPositions,
      })
    },
    flushMutations,
    shadowRootsController,
  }
}
