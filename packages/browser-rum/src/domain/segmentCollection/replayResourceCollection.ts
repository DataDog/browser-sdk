import { isPageExitReason, PageExitReason } from '@datadog/browser-core'
import type { HttpRequest } from '@datadog/browser-core'
import type { LifeCycle } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'
import type { EmitResourceCallback } from '../record'
import { buildResourcePayload } from './buildResourcePayload'
import type { ResourcePayload } from './buildResourcePayload'

interface ReplayResourceCollection {
  emitResource: EmitResourceCallback
  stop(this: void): void
}

interface PendingResource {
  payload: ResourcePayload
  onDiscards: Set<() => void>
}

export function startReplayResourceCollection(
  applicationId: string,
  lifeCycle: LifeCycle,
  httpRequest: HttpRequest<ResourcePayload>
): ReplayResourceCollection {
  const uploadedHashes = new Set<string>()
  const pendingResourcesByHash = new Map<string, PendingResource>()

  const { unsubscribe: unsubscribeRequest } = httpRequest.observable.subscribe((event) => {
    if (event.type === 'success') {
      const resource = pendingResourcesByHash.get(event.payload.hash)
      pendingResourcesByHash.delete(event.payload.hash)
      if (resource) {
        resource.onDiscards.clear()
      }
    } else if (event.type === 'queue-full') {
      const resource = pendingResourcesByHash.get(event.payload.hash)
      pendingResourcesByHash.delete(event.payload.hash)
      if (resource) {
        uploadedHashes.delete(event.payload.hash)
        resource.onDiscards.forEach((onDiscard) => onDiscard())
      }
    }
  })

  const { unsubscribe: unsubscribePageMayExit } = lifeCycle.subscribe(
    LifeCycleEventType.PREPARE_URGENT_FLUSH,
    (reason) => {
      if (isPageExitReason(reason) && reason !== PageExitReason.HIDDEN) {
        pendingResourcesByHash.forEach(({ payload }) => httpRequest.sendOnExit(payload))
      }
    }
  )

  return {
    emitResource: (hash, content, onDiscard) => {
      if (uploadedHashes.has(hash)) {
        if (onDiscard) {
          pendingResourcesByHash.get(hash)?.onDiscards.add(onDiscard)
        }
        return
      }
      uploadedHashes.add(hash)
      const payload = buildResourcePayload(hash, content, applicationId)
      const resource = { payload, onDiscards: new Set<() => void>() }
      if (onDiscard) {
        resource.onDiscards.add(onDiscard)
      }
      pendingResourcesByHash.set(hash, resource)
      httpRequest.send(payload)
    },
    stop: () => {
      unsubscribeRequest()
      unsubscribePageMayExit()
    },
  }
}
