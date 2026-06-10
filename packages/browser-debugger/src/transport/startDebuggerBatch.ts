import type { InitConfiguration, PageMayExitEvent, Batch } from '@datadog/browser-core'
import {
  addEventListener,
  createBatch,
  createFlushController,
  Observable,
  PageExitReason,
  createEndpointBuilder,
} from '@datadog/browser-core'
import { display } from '../domain/display'

export function startDebuggerBatch(initConfiguration: InitConfiguration): Batch {
  const debuggerEndpointBuilder = createEndpointBuilder({ ...initConfiguration, source: 'dd_debugger' }, 'debugger')

  const batch = createBatch({
    endpoints: [debuggerEndpointBuilder],
    reportError: (error) => display.error('transport error:', error),
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

    const visibilityListener = addEventListener(window, 'visibilitychange', onVisibilityChange, { capture: true })
    const unloadListener = addEventListener(window, 'beforeunload', onBeforeUnload)

    return () => {
      visibilityListener.stop()
      unloadListener.stop()
    }
  })
}
