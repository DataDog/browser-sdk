// PoC (phase 2 of the internal API plan, see /plan.md): the transport plugged on the internal API
// notifications. Mirrors startRumBatch, but subscribes to `event_collected` notifications instead
// of the LifeCycle RUM_EVENT_COLLECTED event. In the webview (event bridge) environment, events
// are forwarded to the native bridge instead of being batched.

import {
  canUseEventBridge,
  createBatch,
  getEventBridge,
  noop,
  sendToExtension,
  DeflateEncoderStreamId,
  Observable,
} from '@datadog/browser-core'
import type { Encoder, PageExitReason, SessionManager } from '@datadog/browser-core'
import { createEndpointBuilder, createReplicaEndpointBuilder } from '@datadog/js-core/transport'
import type { RumConfiguration } from '../domain/configuration'
import type { RumInternalApi } from '../domain/internalApi/rumInternalApi.types'
import type { AssembledRumEvent } from '../rawRumEvent.types'
import type { RumEvent } from '../rumEvent.types'
import { createBatchDispatcher } from './startRumBatch'

export function startInternalApiBatch(
  configuration: RumConfiguration,
  internalApi: RumInternalApi,
  sessionManagerPromise: Promise<SessionManager | undefined>,
  createEncoder: (streamId: DeflateEncoderStreamId) => Encoder
): { stop: () => void; prepareUrgentFlushObservable: Observable<PageExitReason> } {
  if (canUseEventBridge()) {
    // Mirrors startRumEventBridge: events are forwarded to the native bridge, no batch. Nothing
    // triggers an urgent flush in webviews; trackViews subscribes to the returned observable for
    // its final view update on page unloading.
    const bridge = getEventBridge<'rum', RumEvent>()!
    const subscription = internalApi.notifications.subscribe((notification) => {
      if (notification.type === 'event_collected') {
        bridge.send('rum', notification.event as unknown as RumEvent)
      }
    })
    return {
      stop: () => subscription.unsubscribe(),
      prepareUrgentFlushObservable: new Observable<PageExitReason>(),
    }
  }

  const endpoints = [createEndpointBuilder(configuration, 'rum')]
  const replicaEndpoint = createReplicaEndpointBuilder(configuration, 'rum')
  if (replicaEndpoint) {
    endpoints.push(replicaEndpoint)
  }
  const batch = createBatch({
    encoder: createEncoder(DeflateEncoderStreamId.RUM),
    endpoints,
    // PoC corner-cut: errors are not reported to the customer (today they surface as RUM error
    // events); the internal API rate limiters also report with noop.
    reportError: noop,
  })
  void sessionManagerPromise.then((sessionManager) => {
    sessionManager?.expireObservable.subscribe(() => batch.forceFlush('session_expire'))
  })

  const { dispatch, stop: stopDispatcher } = createBatchDispatcher(batch, configuration.betaEnableViewUpdates)
  const subscription = internalApi.notifications.subscribe((notification) => {
    if (notification.type === 'event_collected') {
      // Cast: the internal API AssembledRumEvent stands in for the schema-typed RumEvent (see the
      // internal API notes). sendToExtension mirrors startRum's forwarding to the devtools
      // extension.
      sendToExtension('rum', notification.event)
      dispatch(notification.event as unknown as AssembledRumEvent)
    }
  })

  return {
    stop: () => {
      subscription.unsubscribe()
      stopDispatcher()
      batch.stop()
    },
    prepareUrgentFlushObservable: batch.prepareUrgentFlushObservable,
  }
}
