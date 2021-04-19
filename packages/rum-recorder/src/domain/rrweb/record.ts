import { runOnReadyState } from '@datadog/browser-core'
import { snapshot } from '../rrweb-snapshot'
import { RawRecord, RecordType } from '../../types'
import { initObservers } from './observer'
import { IncrementalSource, ListenerHandler, RecordAPI, RecordOptions } from './types'
import { getWindowHeight, getWindowWidth } from './utils'
import { MutationController } from './mutation'

let wrappedEmit!: (record: RawRecord, isCheckout?: boolean) => void

export function record(options: RecordOptions = {}): RecordAPI {
  const { emit } = options
  // runtime checks for user options
  if (!emit) {
    throw new Error('emit function is required')
  }

  const mutationController = new MutationController()

  wrappedEmit = (record, isCheckout) => {
    if (
      mutationController.isFrozen() &&
      record.type !== RecordType.FullSnapshot &&
      !(record.type === RecordType.IncrementalSnapshot && record.data.source === IncrementalSource.Mutation)
    ) {
      // we've got a user initiated record so first we need to apply
      // all DOM changes that have been buffering during paused state
      mutationController.unfreeze()
    }

    emit(record, isCheckout)
  }

  const takeFullSnapshot = (isCheckout = false) => {
    const wasFrozen = mutationController.isFrozen()
    mutationController.freeze() // don't allow any node to be serialized or mutation to be emitted during sharpshooting

    wrappedEmit(
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

    wrappedEmit(
      {
        data: {
          has_focus: document.hasFocus(),
        },
        type: RecordType.Focus,
      },
      isCheckout
    )

    const node = snapshot(document)

    if (!node) {
      return console.warn('Failed to snapshot the document')
    }

    wrappedEmit({
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
    if (!wasFrozen) {
      mutationController.unfreeze()
    }
  }

  const handlers: ListenerHandler[] = []
  const init = () => {
    takeFullSnapshot()

    handlers.push(
      initObservers({
        mutationController,
        inputCb: (v) =>
          wrappedEmit({
            data: {
              source: IncrementalSource.Input,
              ...v,
            },
            type: RecordType.IncrementalSnapshot,
          }),
        mediaInteractionCb: (p) =>
          wrappedEmit({
            data: {
              source: IncrementalSource.MediaInteraction,
              ...p,
            },
            type: RecordType.IncrementalSnapshot,
          }),
        mouseInteractionCb: (d) =>
          wrappedEmit({
            data: {
              source: IncrementalSource.MouseInteraction,
              ...d,
            },
            type: RecordType.IncrementalSnapshot,
          }),
        mousemoveCb: (positions, source) =>
          wrappedEmit({
            data: {
              positions,
              source,
            },
            type: RecordType.IncrementalSnapshot,
          }),
        mutationCb: (m) =>
          wrappedEmit({
            data: {
              source: IncrementalSource.Mutation,
              ...m,
            },
            type: RecordType.IncrementalSnapshot,
          }),
        scrollCb: (p) =>
          wrappedEmit({
            data: {
              source: IncrementalSource.Scroll,
              ...p,
            },
            type: RecordType.IncrementalSnapshot,
          }),
        styleSheetRuleCb: (r) =>
          wrappedEmit({
            data: {
              source: IncrementalSource.StyleSheetRule,
              ...r,
            },
            type: RecordType.IncrementalSnapshot,
          }),
        viewportResizeCb: (d) =>
          wrappedEmit({
            data: {
              source: IncrementalSource.ViewportResize,
              ...d,
            },
            type: RecordType.IncrementalSnapshot,
          }),
        focusCb: (data) =>
          wrappedEmit({
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
