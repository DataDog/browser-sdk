import { runOnReadyState } from '@datadog/browser-core'
import { snapshot } from '../rrweb-snapshot'
import { RecordType } from '../../types'
import { initObservers } from './observer'
import { IncrementalSource, ListenerHandler, RecordAPI, RecordOptions } from './types'
import { getWindowHeight, getWindowWidth, mirror } from './utils'
import { MutationController } from './mutation'

export function record(options: RecordOptions): RecordAPI {
  const { emit, useNewMutationObserver } = options
  // runtime checks for user options
  if (!emit) {
    throw new Error('emit function is required')
  }

  const mutationController = new MutationController()

  const takeFullSnapshot = (isCheckout = false) => {
    mutationController.flush() // process any pending mutation before taking a full snapshot

    emit(
      {
        data: {
          height: getWindowHeight(),
          href: window.location.href,
          width: getWindowWidth(),
        },
        type: RecordType.Meta,
      },
      isCheckout
    )

    emit(
      {
        data: {
          has_focus: document.hasFocus(),
        },
        type: RecordType.Focus,
      },
      isCheckout
    )

    const [node, idNodeMap] = snapshot(document)

    if (!node) {
      return console.warn('Failed to snapshot the document')
    }

    mirror.map = idNodeMap
    emit({
      data: {
        node,
        initialOffset: {
          left:
            window.pageXOffset !== undefined
              ? window.pageXOffset
              : document?.documentElement.scrollLeft ||
                document?.body?.parentElement?.scrollLeft ||
                document?.body.scrollLeft ||
                0,
          top:
            window.pageYOffset !== undefined
              ? window.pageYOffset
              : document?.documentElement.scrollTop ||
                document?.body?.parentElement?.scrollTop ||
                document?.body.scrollTop ||
                0,
        },
      },
      type: RecordType.FullSnapshot,
    })
  }

  const handlers: ListenerHandler[] = []
  const init = () => {
    takeFullSnapshot()

    handlers.push(
      initObservers({
        useNewMutationObserver,
        mutationController,
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
      })
    )
  }

  runOnReadyState('complete', init)

  return {
    stop: () => {
      handlers.forEach((h) => h())
    },
    takeFullSnapshot,
  }
}
