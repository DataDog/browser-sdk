import type { InitConfiguration, PageMayExitEvent, Batch } from '@datadog/browser-core'
import {
  addEventListener,
  createBatch,
  createFlushController,
  createHttpRequest,
  createIdentityEncoder,
  computeTransportConfiguration,
  Observable,
  PageExitReason,
  display,
} from '@datadog/browser-core'

export function startDebuggerBatch(initConfiguration: InitConfiguration): Batch {
  const { debuggerEndpointBuilder } = computeTransportConfiguration({ ...initConfiguration, source: 'dd_debugger' })

  const batch = createBatch({
    encoder: createIdentityEncoder(),
    request: createHttpRequest([debuggerEndpointBuilder], (error) => display.error('Debugger transport error:', error)),
    flushController: createFlushController({
      pageMayExitObservable: createSimplePageMayExitObservable(),
      sessionExpireObservable: new Observable(),
    }),
  })

  return batch
}

function createSimplePageMayExitObservable(): Observable<PageMayExitEvent> {
  return new Observable<PageMayExitEvent>((observable) => {
    if (typeof window === 'undefined') {
      return
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        observable.notify({ reason: PageExitReason.HIDDEN })
      }
    }

    const onBeforeUnload = () => {
      observable.notify({ reason: PageExitReason.UNLOADING })
    }

    const visibilityListener = addEventListener({}, window, 'visibilitychange', onVisibilityChange, { capture: true })
    const unloadListener = addEventListener({}, window, 'beforeunload', onBeforeUnload)

    return () => {
      visibilityListener.stop()
      unloadListener.stop()
    }
  })
}
