import type { TimeStamp } from '@datadog/browser-core'
import { timeStampNow } from '@datadog/browser-core'
import type { LifeCycle, RumConfiguration } from '@datadog/browser-rum-core'
import { getViewportDimension } from '@datadog/browser-rum-core'
import type {
  BrowserMutationData,
  BrowserRecord,
  InputData,
  MediaInteractionData,
  MousemoveData,
  ScrollData,
  StyleSheetRuleData,
  ViewportResizeData,
} from '../../types'
import { RecordType, IncrementalSource } from '../../types'
import { serializeDocument, SerializationContextStatus } from './serialize'
import { initObservers } from './observers'

import { MutationController } from './mutationObserver'
import { getVisualViewport, getScrollX, getScrollY } from './viewports'
import { assembleIncrementalSnapshot } from './utils'
import { createElementsScrollPositions } from './elementsScrollPositions'

export interface RecordOptions {
  emit?: (record: BrowserRecord) => void
  configuration: RumConfiguration
  lifeCycle: LifeCycle
}

export interface RecordAPI {
  stop: () => void
  takeSubsequentFullSnapshot: (timestamp?: TimeStamp) => void
  flushMutations: () => void
}

export function record(options: RecordOptions): RecordAPI {
  const { emit } = options
  // runtime checks for user options
  if (!emit) {
    throw new Error('emit function is required')
  }

  const mutationController = new MutationController()
  const elementsScrollPositions = createElementsScrollPositions()

  const takeFullSnapshot = (
    timestamp = timeStampNow(),
    serializationContext = { status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT, elementsScrollPositions }
  ) => {
    mutationController.flush() // process any pending mutation before taking a full snapshot
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
        data: getVisualViewport(),
        type: RecordType.VisualViewport,
        timestamp,
      })
    }
  }

  takeFullSnapshot()

  const stopObservers = initObservers({
    lifeCycle: options.lifeCycle,
    configuration: options.configuration,
    mutationController,
    elementsScrollPositions,
    inputCb: (v) => emit(assembleIncrementalSnapshot<InputData>(IncrementalSource.Input, v)),
    mediaInteractionCb: (p) =>
      emit(assembleIncrementalSnapshot<MediaInteractionData>(IncrementalSource.MediaInteraction, p)),
    mouseInteractionCb: (mouseInteractionRecord) => emit(mouseInteractionRecord),
    mousemoveCb: (positions, source) => emit(assembleIncrementalSnapshot<MousemoveData>(source, { positions })),
    mutationCb: (m) => emit(assembleIncrementalSnapshot<BrowserMutationData>(IncrementalSource.Mutation, m)),
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
  })

  return {
    stop: stopObservers,
    takeSubsequentFullSnapshot: (timestamp) =>
      takeFullSnapshot(timestamp, {
        status: SerializationContextStatus.SUBSEQUENT_FULL_SNAPSHOT,
        elementsScrollPositions,
      }),
    flushMutations: () => mutationController.flush(),
  }
}
