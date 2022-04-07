import { assign, timeStampNow } from '@datadog/browser-core'
import type { IncrementalSnapshotRecord } from '../../types'
import { RecordType } from '../../types'
import { serializeDocument } from './serialize'
import { initObservers } from './observer'
import { IncrementalSource } from './types'
import type {
  IncrementalData,
  InputData,
  RecordAPI,
  RecordOptions,
  MediaInteractionData,
  MouseInteractionData,
  MousemoveData,
  MutationData,
  ScrollData,
  StyleSheetRuleData,
  ViewportResizeData,
} from './types'

import { MutationController } from './mutationObserver'
import { getVisualViewport, getScrollX, getScrollY, getWindowHeight, getWindowWidth } from './viewports'

export function record(options: RecordOptions): RecordAPI {
  const { emit } = options
  // runtime checks for user options
  if (!emit) {
    throw new Error('emit function is required')
  }

  const mutationController = new MutationController()

  const takeFullSnapshot = (timestamp = timeStampNow()) => {
    mutationController.flush() // process any pending mutation before taking a full snapshot

    emit({
      data: {
        height: getWindowHeight(),
        href: window.location.href,
        width: getWindowWidth(),
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
        node: serializeDocument(document, options.defaultPrivacyLevel),
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
    mutationController,
    defaultPrivacyLevel: options.defaultPrivacyLevel,
    inputCb: (v) => emit(assembleIncrementalSnapshot<InputData>(IncrementalSource.Input, v)),
    mediaInteractionCb: (p) =>
      emit(assembleIncrementalSnapshot<MediaInteractionData>(IncrementalSource.MediaInteraction, p)),
    mouseInteractionCb: (d) =>
      emit(assembleIncrementalSnapshot<MouseInteractionData>(IncrementalSource.MouseInteraction, d)),
    mousemoveCb: (positions, source) => emit(assembleIncrementalSnapshot<MousemoveData>(source, { positions })),
    mutationCb: (m) => emit(assembleIncrementalSnapshot<MutationData>(IncrementalSource.Mutation, m)),
    scrollCb: (p) => emit(assembleIncrementalSnapshot<ScrollData>(IncrementalSource.Scroll, p)),
    styleSheetRuleCb: (r) => emit(assembleIncrementalSnapshot<StyleSheetRuleData>(IncrementalSource.StyleSheetRule, r)),
    viewportResizeCb: (d) => emit(assembleIncrementalSnapshot<ViewportResizeData>(IncrementalSource.ViewportResize, d)),

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
    takeFullSnapshot,
    flushMutations: () => mutationController.flush(),
  }
}

function assembleIncrementalSnapshot<Data extends IncrementalData>(
  source: Data['source'],
  data: Omit<Data, 'source'>
): IncrementalSnapshotRecord {
  return {
    data: assign(
      {
        source,
      },
      data
    ) as Data,
    type: RecordType.IncrementalSnapshot,
    timestamp: timeStampNow(),
  }
}
