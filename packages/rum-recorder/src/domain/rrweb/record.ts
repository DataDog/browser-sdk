import { runOnReadyState } from '@datadog/browser-core'
import { SlimDOMOptions, snapshot } from '../rrweb-snapshot'
import { RawRecord, RecordType } from '../../types'
import { initObservers } from './observer'
import { IncrementalSource, ListenerHandler, RecordAPI, RecordOptions } from './types'
import { getWindowHeight, getWindowWidth, mirror } from './utils'
import { MutationController } from './mutation'

let wrappedEmit!: (record: RawRecord, isCheckout?: boolean) => void

export function record(options: RecordOptions = {}): RecordAPI {
  const {
    emit,
    checkoutEveryNms,
    checkoutEveryNth,
    inlineStylesheet = true,
    slimDOMOptions: slimDOMOptionsArg,
  } = options
  // runtime checks for user options
  if (!emit) {
    throw new Error('emit function is required')
  }

  const slimDOMOptions: SlimDOMOptions =
    slimDOMOptionsArg === true || slimDOMOptionsArg === 'all'
      ? {
          comment: true,
          headFavicon: true,
          // the following are off for slimDOMOptions === true,
          // as they destroy some (hidden) info:
          headMetaAuthorship: slimDOMOptionsArg === 'all',
          headMetaDescKeywords: slimDOMOptionsArg === 'all',
          headMetaHttpEquiv: true,
          headMetaRobots: true,
          headMetaSocial: true,
          headMetaVerification: true,
          headWhitespace: true,
          script: true,
        }
      : slimDOMOptionsArg
      ? slimDOMOptionsArg
      : {}

  const mutationController = new MutationController()

  let lastFullSnapshotRecordTimestamp: number
  let incrementalSnapshotCount = 0
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
    if (record.type === RecordType.FullSnapshot) {
      lastFullSnapshotRecordTimestamp = Date.now()
      incrementalSnapshotCount = 0
    } else if (record.type === RecordType.IncrementalSnapshot) {
      incrementalSnapshotCount += 1
      const exceedCount = checkoutEveryNth && incrementalSnapshotCount >= checkoutEveryNth
      const exceedTime = checkoutEveryNms && Date.now() - lastFullSnapshotRecordTimestamp > checkoutEveryNms
      if (exceedCount || exceedTime) {
        takeFullSnapshot(true)
      }
    }
  }

  const takeFullSnapshot = (isCheckout = false) => {
    const wasFrozen = mutationController.isFrozen()
    mutationController.freeze() // don't allow any mirror modifications during snapshotting

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

    const [node, idNodeMap] = snapshot(document, {
      inlineStylesheet,
      slimDOM: slimDOMOptions,
    })

    if (!node) {
      return console.warn('Failed to snapshot the document')
    }

    mirror.map = idNodeMap
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
        inlineStylesheet,
        slimDOMOptions,
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
