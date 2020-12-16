/* tslint:disable:no-null-keyword */
import { MaskInputOptions, SlimDOMOptions, snapshot } from 'rrweb-snapshot'
import { initObservers, mutationBuffer } from './observer'
import { Event, EventType, EventWithTime, IncrementalSource, ListenerHandler, RecordOptions } from './types'
import { getWindowHeight, getWindowWidth, mirror, on, polyfill } from './utils'

function wrapEvent(e: Event): EventWithTime {
  return {
    ...e,
    timestamp: Date.now(),
  }
}

let wrappedEmit!: (e: EventWithTime, isCheckout?: boolean) => void

function record<T = EventWithTime>(options: RecordOptions<T> = {}): ListenerHandler | undefined {
  const {
    emit,
    checkoutEveryNms,
    checkoutEveryNth,
    blockClass = 'rr-block',
    blockSelector = null,
    ignoreClass = 'rr-ignore',
    inlineStylesheet = true,
    maskAllInputs,
    maskInputOptions: maskInputOptionsArg,
    slimDOMOptions: slimDOMOptionsArg,
    maskInputFn,
    hooks,
    packFn,
    sampling = {},
    mousemoveWait,
    recordCanvas = false,
    collectFonts = false,
  } = options
  // runtime checks for user options
  if (!emit) {
    throw new Error('emit function is required')
  }
  // move departed options to new options
  if (mousemoveWait !== undefined && sampling.mousemove === undefined) {
    sampling.mousemove = mousemoveWait
  }

  const maskInputOptions: MaskInputOptions =
    maskAllInputs === true
      ? {
          color: true,
          date: true,
          'datetime-local': true,
          email: true,
          month: true,
          number: true,
          range: true,
          search: true,
          select: true,
          tel: true,
          text: true,
          textarea: true,
          time: true,
          url: true,
          week: true,
        }
      : maskInputOptionsArg !== undefined
      ? maskInputOptionsArg
      : {}

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

  polyfill()

  let lastFullSnapshotEvent: EventWithTime
  let incrementalSnapshotCount = 0
  wrappedEmit = (e: EventWithTime, isCheckout?: boolean) => {
    if (
      mutationBuffer.isFrozen() &&
      e.type !== EventType.FullSnapshot &&
      !(e.type === EventType.IncrementalSnapshot && e.data.source === IncrementalSource.Mutation)
    ) {
      // we've got a user initiated event so first we need to apply
      // all DOM changes that have been buffering during paused state
      mutationBuffer.emit()
      mutationBuffer.unfreeze()
    }

    emit(((packFn ? packFn(e) : e) as unknown) as T, isCheckout)
    if (e.type === EventType.FullSnapshot) {
      lastFullSnapshotEvent = e
      incrementalSnapshotCount = 0
    } else if (e.type === EventType.IncrementalSnapshot) {
      incrementalSnapshotCount += 1
      const exceedCount = checkoutEveryNth && incrementalSnapshotCount >= checkoutEveryNth
      const exceedTime = checkoutEveryNms && e.timestamp - lastFullSnapshotEvent.timestamp > checkoutEveryNms
      if (exceedCount || exceedTime) {
        takeFullSnapshot(true)
      }
    }
  }

  function takeFullSnapshot(isCheckout = false) {
    wrappedEmit(
      wrapEvent({
        data: {
          height: getWindowHeight(),
          href: window.location.href,
          width: getWindowWidth(),
        },
        type: EventType.Meta,
      }),
      isCheckout
    )

    const wasFrozen = mutationBuffer.isFrozen()
    mutationBuffer.freeze() // don't allow any mirror modifications during snapshotting
    const [node, idNodeMap] = snapshot(document, {
      blockClass,
      blockSelector,
      inlineStylesheet,
      recordCanvas,
      maskAllInputs: maskInputOptions,
      slimDOM: slimDOMOptions,
    })

    if (!node) {
      return console.warn('Failed to snapshot the document')
    }

    mirror.map = idNodeMap
    wrappedEmit(
      wrapEvent({
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
        type: EventType.FullSnapshot,
      })
    )
    if (!wasFrozen) {
      mutationBuffer.emit() // emit anything queued up now
      mutationBuffer.unfreeze()
    }
  }

  try {
    const handlers: ListenerHandler[] = []
    handlers.push(
      on('DOMContentLoaded', () => {
        wrappedEmit(
          wrapEvent({
            data: {},
            type: EventType.DomContentLoaded,
          })
        )
      })
    )
    const init = () => {
      takeFullSnapshot()

      handlers.push(
        initObservers(
          {
            blockClass,
            blockSelector,
            collectFonts,
            ignoreClass,
            inlineStylesheet,
            maskInputFn,
            maskInputOptions,
            recordCanvas,
            sampling,
            slimDOMOptions,
            canvasMutationCb: (p) =>
              wrappedEmit(
                wrapEvent({
                  data: {
                    source: IncrementalSource.CanvasMutation,
                    ...p,
                  },
                  type: EventType.IncrementalSnapshot,
                })
              ),
            fontCb: (p) =>
              wrappedEmit(
                wrapEvent({
                  data: {
                    source: IncrementalSource.Font,
                    ...p,
                  },
                  type: EventType.IncrementalSnapshot,
                })
              ),
            inputCb: (v) =>
              wrappedEmit(
                wrapEvent({
                  data: {
                    source: IncrementalSource.Input,
                    ...v,
                  },
                  type: EventType.IncrementalSnapshot,
                })
              ),
            mediaInteractionCb: (p) =>
              wrappedEmit(
                wrapEvent({
                  data: {
                    source: IncrementalSource.MediaInteraction,
                    ...p,
                  },
                  type: EventType.IncrementalSnapshot,
                })
              ),
            mouseInteractionCb: (d) =>
              wrappedEmit(
                wrapEvent({
                  data: {
                    source: IncrementalSource.MouseInteraction,
                    ...d,
                  },
                  type: EventType.IncrementalSnapshot,
                })
              ),
            mousemoveCb: (positions, source) =>
              wrappedEmit(
                wrapEvent({
                  data: {
                    positions,
                    source,
                  },
                  type: EventType.IncrementalSnapshot,
                })
              ),
            mutationCb: (m) =>
              wrappedEmit(
                wrapEvent({
                  data: {
                    source: IncrementalSource.Mutation,
                    ...m,
                  },
                  type: EventType.IncrementalSnapshot,
                })
              ),
            scrollCb: (p) =>
              wrappedEmit(
                wrapEvent({
                  data: {
                    source: IncrementalSource.Scroll,
                    ...p,
                  },
                  type: EventType.IncrementalSnapshot,
                })
              ),
            styleSheetRuleCb: (r) =>
              wrappedEmit(
                wrapEvent({
                  data: {
                    source: IncrementalSource.StyleSheetRule,
                    ...r,
                  },
                  type: EventType.IncrementalSnapshot,
                })
              ),
            viewportResizeCb: (d) =>
              wrappedEmit(
                wrapEvent({
                  data: {
                    source: IncrementalSource.ViewportResize,
                    ...d,
                  },
                  type: EventType.IncrementalSnapshot,
                })
              ),
          },
          hooks
        )
      )
    }
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
      init()
    } else {
      handlers.push(
        on(
          'load',
          () => {
            wrappedEmit(
              wrapEvent({
                data: {},
                type: EventType.Load,
              })
            )
            init()
          },
          window
        )
      )
    }
    return () => {
      handlers.forEach((h) => h())
    }
  } catch (error) {
    // TODO: handle internal error
    console.warn(error)
  }
}

record.addCustomEvent = <T>(tag: string, payload: T) => {
  if (!wrappedEmit) {
    throw new Error('please add custom event after start recording')
  }
  wrappedEmit(
    wrapEvent({
      data: {
        payload,
        tag,
      },
      type: EventType.Custom,
    })
  )
}

record.freezePage = () => {
  mutationBuffer.freeze()
}

export { record }
