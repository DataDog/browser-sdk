import type { TimeStamp } from '@datadog/browser-core'
import { DOM_EVENT, timeStampNow, addTelemetryDebug } from '@datadog/browser-core'
import type { LifeCycle, RumConfiguration } from '@datadog/browser-rum-core'
import { getViewportDimension } from '@datadog/browser-rum-core'
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
import { serializeDocument, SerializationContextStatus } from './serialize'
import { initInputObserver, initObservers } from './observers'
import type { InputCallback } from './observers'

import { startMutationObserver } from './mutationObserver'
import { getVisualViewport, getScrollX, getScrollY } from './viewports'
import { assembleIncrementalSnapshot } from './utils'
import { createElementsScrollPositions } from './elementsScrollPositions'

export interface RecordOptions {
  emit?: (record: BrowserRecord) => void
  configuration: RumConfiguration
  lifeCycle: LifeCycle
}

interface ShadowDomCallBacks {
  stop: () => void
  flush: () => void
}
export interface RecordAPI {
  stop: () => void
  takeSubsequentFullSnapshot: (timestamp?: TimeStamp) => void
  // the following is only used for testing purposes
  flushMutations: () => void
  shadowDomCallBacks: Map<ShadowRoot, ShadowDomCallBacks>
}

export function record(options: RecordOptions): RecordAPI {
  const { emit } = options
  // runtime checks for user options
  if (!emit) {
    throw new Error('emit function is required')
  }

  const shadowDomCallBacks = new Map<ShadowRoot, ShadowDomCallBacks>()
  const elementsScrollPositions = createElementsScrollPositions()

  const shadowDomRemovedCallback = (shadowRoot: ShadowRoot) => {
    const entry = shadowDomCallBacks.get(shadowRoot)
    if (!entry) {
      addTelemetryDebug('no shadow root in map')
      return
    }
    entry.stop()
    shadowDomCallBacks.delete(shadowRoot)
  }

  const mutationCb = (mutation: BrowserMutationPayload) => {
    emit(assembleIncrementalSnapshot<BrowserMutationData>(IncrementalSource.Mutation, mutation))
  }
  const inputCb: InputCallback = (s) => emit(assembleIncrementalSnapshot<InputData>(IncrementalSource.Input, s))
  const shadowDomCreatedCallback = (shadowRoot: ShadowRoot) => {
    const { stop: stopMutationObserver, flush } = startMutationObserver(
      mutationCb,
      options.configuration,
      { shadowDomCreatedCallback, shadowDomRemovedCallback },
      shadowRoot
    )
    // the change event no do bubble up across the shadow root, we have to listen on the shadow root
    const stopInputObserver = initInputObserver(inputCb, options.configuration.defaultPrivacyLevel, {
      target: shadowRoot,
      domEvents: [DOM_EVENT.CHANGE],
    })
    shadowDomCallBacks.set(shadowRoot, {
      flush,
      stop: () => {
        stopMutationObserver()
        stopInputObserver()
      },
    })
  }

  const takeFullSnapshot = (
    timestamp = timeStampNow(),
    serializationContext = { status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT, elementsScrollPositions },
    flushMutationsFromPreviousFs?: () => void
  ) => {
    shadowDomCallBacks.forEach(({ flush }) => flush())
    if (flushMutationsFromPreviousFs) {
      flushMutationsFromPreviousFs() // process any pending mutation before taking a full snapshot
    }
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
        node: serializeDocument(document, options.configuration, serializationContext, shadowDomCreatedCallback),
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

  const { stop: stopObservers, flush: flushMutations } = initObservers({
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
    shadowDomCallBacks: { shadowDomCreatedCallback, shadowDomRemovedCallback },
  })
  return {
    stop: () => {
      shadowDomCallBacks.forEach(({ stop }) => stop())
      stopObservers()
    },
    takeSubsequentFullSnapshot: (timestamp) =>
      takeFullSnapshot(
        timestamp,
        {
          status: SerializationContextStatus.SUBSEQUENT_FULL_SNAPSHOT,
          elementsScrollPositions,
        },
        flushMutations
      ),
    flushMutations: () => {
      shadowDomCallBacks.forEach(({ flush }) => flush())
      flushMutations()
    },
    shadowDomCallBacks,
  }
}
