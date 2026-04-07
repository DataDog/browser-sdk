import type { InitConfiguration, PageMayExitEvent } from '@datadog/browser-core'
import {
  createBatch,
  createFlushController,
  createHttpRequest,
  createIdentityEncoder,
  computeTransportConfiguration,
  Observable,
  PageExitReason,
  display,
} from '@datadog/browser-core'
import type { Batch } from '@datadog/browser-core'

export function startDebuggerBatch(initConfiguration: InitConfiguration): Batch {
  const { logsEndpointBuilder } = computeTransportConfiguration(initConfiguration)

  const batch = createBatch({
    encoder: createIdentityEncoder(),
    request: createHttpRequest([logsEndpointBuilder], (error) => display.error('Debugger transport error:', error)),
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

    window.addEventListener('visibilitychange', onVisibilityChange, { capture: true })
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      window.removeEventListener('visibilitychange', onVisibilityChange, { capture: true })
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  })
}
