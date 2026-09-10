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

interface PendingResource {
  hash: string
  onDiscards: Set<() => void>
}

export function startReplayResourceCollection(
  applicationId: string,
  lifeCycle: LifeCycle,
  httpRequest: HttpRequest<Payload>
): ReplayResourceCollection {
  const uploadedHashes = new Set<string>()
  const pendingResources = new Map<Payload, PendingResource>()
  const pendingResourcesByHash = new Map<string, PendingResource>()

  const { unsubscribe: unsubscribeRequest } = httpRequest.observable.subscribe((event) => {
    if (event.type === 'success') {
      const resource = pendingResources.get(event.payload)
      pendingResources.delete(event.payload)
      if (resource) {
        pendingResourcesByHash.delete(resource.hash)
        resource.onDiscards.clear()
      }
    } else if (event.type === 'queue-full') {
      const resource = pendingResources.get(event.payload)
      pendingResources.delete(event.payload)
      if (resource) {
        uploadedHashes.delete(resource.hash)
        pendingResourcesByHash.delete(resource.hash)
        resource.onDiscards.forEach((onDiscard) => onDiscard())
      }
    }
  })

  const { unsubscribe: unsubscribePageMayExit } = lifeCycle.subscribe(
    LifeCycleEventType.PREPARE_URGENT_FLUSH,
    (reason) => {
      if (isPageExitReason(reason) && reason !== PageExitReason.HIDDEN) {
        pendingResources.forEach((_resource, payload) => httpRequest.sendOnExit(payload))
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
      const resource = { hash, onDiscards: new Set<() => void>() }
      if (onDiscard) {
        resource.onDiscards.add(onDiscard)
      }
      pendingResources.set(payload, resource)
      pendingResourcesByHash.set(hash, resource)
      httpRequest.send(payload)
    },
    stop: () => {
      unsubscribeRequest()
      unsubscribePageMayExit()
    },
  }
}
