import { isPageExitReason, PageExitReason } from '@datadog/browser-core'
import type { HttpRequest, Payload } from '@datadog/browser-core'
import type { LifeCycle } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'
import type { EmitResourceCallback } from '../record'
import { buildResourcePayload } from './buildResourcePayload'

interface ReplayResourceCollection {
  emitResource: EmitResourceCallback
  stop(this: void): void
}

export function startReplayResourceCollection(
  applicationId: string,
  lifeCycle: LifeCycle,
  httpRequest: HttpRequest<Payload>
): ReplayResourceCollection {
  const uploadedHashes = new Set<string>()
  const pendingResources = new Map<Payload, string>()

  const { unsubscribe: unsubscribeRequest } = httpRequest.observable.subscribe((event) => {
    if (event.type === 'success') {
      pendingResources.delete(event.payload)
    } else if (event.type === 'queue-full') {
      const hash = pendingResources.get(event.payload)
      pendingResources.delete(event.payload)
      if (hash) {
        uploadedHashes.delete(hash)
      }
    }
  })

  const { unsubscribe: unsubscribePageMayExit } = lifeCycle.subscribe(
    LifeCycleEventType.PREPARE_URGENT_FLUSH,
    (reason) => {
      if (isPageExitReason(reason) && reason !== PageExitReason.HIDDEN) {
        pendingResources.forEach((_hash, payload) => httpRequest.sendOnExit(payload))
      }
    }
  )

  return {
    emitResource: (hash, content) => {
      if (uploadedHashes.has(hash)) {
        return
      }
      uploadedHashes.add(hash)
      const payload = buildResourcePayload(hash, content, applicationId)
      pendingResources.set(payload, hash)
      httpRequest.send(payload)
    },
    stop: () => {
      unsubscribeRequest()
      unsubscribePageMayExit()
    },
  }
}
