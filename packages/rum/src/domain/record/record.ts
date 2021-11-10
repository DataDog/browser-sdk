import { isExperimentalFeatureEnabled } from '@datadog/browser-core'
import { RecordType } from '../../types'
import { serializeDocument } from './serialize'
import { initObservers } from './observer'
import { IncrementalSource, RecordAPI, RecordOptions } from './types'

import { MutationController } from './mutationObserver'
import { getVisualViewport, getScrollX, getScrollY, getWindowHeight, getWindowWidth } from './viewports'

export function record(options: RecordOptions): RecordAPI {
  const { emit } = options
  // runtime checks for user options
  if (!emit) {
    throw new Error('emit function is required')
  }

  const mutationController = new MutationController()

  const takeFullSnapshot = () => {
    mutationController.flush() // process any pending mutation before taking a full snapshot

    emit({
      data: {
        height: getWindowHeight(),
        href: window.location.href,
        width: getWindowWidth(),
      },
      type: RecordType.Meta,
    })

    emit({
      data: {
        has_focus: document.hasFocus(),
      },
      type: RecordType.Focus,
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
    })

    if (isExperimentalFeatureEnabled('visualviewport') && window.visualViewport) {
      emit({
        data: getVisualViewport(),
        type: RecordType.VisualViewport,
      })
    }
  }

  takeFullSnapshot()

  const stopObservers = initObservers({
    mutationController,
    defaultPrivacyLevel: options.defaultPrivacyLevel,
    inputCb: (v) =>
      emit({
        data: {
          source: IncrementalSource.Input,
          ...v,
        },
        type: RecordType.IncrementalSnapshot,
      }),
    mediaInteractionCb: (p) =>
      emit({
        data: {
          source: IncrementalSource.MediaInteraction,
          ...p,
        },
        type: RecordType.IncrementalSnapshot,
      }),
    mouseInteractionCb: (d) =>
      emit({
        data: {
          source: IncrementalSource.MouseInteraction,
          ...d,
        },
        type: RecordType.IncrementalSnapshot,
      }),
    mousemoveCb: (positions, source) =>
      emit({
        data: {
          positions,
          source,
        },
        type: RecordType.IncrementalSnapshot,
      }),
    mutationCb: (m) =>
      emit({
        data: {
          source: IncrementalSource.Mutation,
          ...m,
        },
        type: RecordType.IncrementalSnapshot,
      }),
    scrollCb: (p) =>
      emit({
        data: {
          source: IncrementalSource.Scroll,
          ...p,
        },
        type: RecordType.IncrementalSnapshot,
      }),
    styleSheetRuleCb: (r) =>
      emit({
        data: {
          source: IncrementalSource.StyleSheetRule,
          ...r,
        },
        type: RecordType.IncrementalSnapshot,
      }),
    viewportResizeCb: (d) =>
      emit({
        data: {
          source: IncrementalSource.ViewportResize,
          ...d,
        },
        type: RecordType.IncrementalSnapshot,
      }),
    focusCb: (data) =>
      emit({
        type: RecordType.Focus,
        data,
      }),
    visualViewportResizeCb: (data) => {
      emit({
        data,
        type: RecordType.VisualViewport,
      })
    },
  })

  return {
    stop: stopObservers,
    takeFullSnapshot,
    flushMutations: () => mutationController.flush(),
  }
}
