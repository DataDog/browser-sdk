import { isPageExitReason, PageExitReason } from '@datadog/browser-core'
import type { HttpRequest, Payload } from '@datadog/browser-core'
import type { LifeCycle } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'
import type { EmitCanvasResourceCallback } from '../record'
import { buildCanvasResourcePayload } from './buildCanvasResourcePayload'

interface CanvasResourceCollection {
  emitCanvasResource: EmitCanvasResourceCallback
  stop(this: void): void
}

export function startCanvasResourceCollection(
  applicationId: string,
  lifeCycle: LifeCycle,
  httpRequest: HttpRequest<Payload>
): CanvasResourceCollection {
  const uploadedHashes = new Set<string>()
  const pendingHashes = new WeakMap<Payload, string>()
  const pendingPayloads = new Set<Payload>()

  const { unsubscribe: unsubscribeRequest } = httpRequest.observable.subscribe((event) => {
    if (event.type === 'success') {
      pendingPayloads.delete(event.payload)
    } else if (event.type === 'queue-full') {
      pendingPayloads.delete(event.payload)
      const hash = pendingHashes.get(event.payload)
      if (hash) {
        uploadedHashes.delete(hash)
      }
    }
  })

  const { unsubscribe: unsubscribePageMayExit } = lifeCycle.subscribe(
    LifeCycleEventType.PREPARE_URGENT_FLUSH,
    (reason) => {
      if (isPageExitReason(reason) && reason !== PageExitReason.HIDDEN) {
        pendingPayloads.forEach(httpRequest.sendOnExit)
      }
    }
  )

  return {
    emitCanvasResource: (hash, image) => {
      if (uploadedHashes.has(hash)) {
        return
      }
      uploadedHashes.add(hash)
      const payload = buildCanvasResourcePayload(hash, image, applicationId)
      pendingHashes.set(payload, hash)
      pendingPayloads.add(payload)
      httpRequest.send(payload)
    },
    stop: () => {
      unsubscribeRequest()
      unsubscribePageMayExit()
    },
  }
}
