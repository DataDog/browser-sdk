import type { Context, Observable, PageMayExitEvent, RawError } from '@datadog/browser-core'
import { createIdentityEncoder, startBatchWithReplica } from '@datadog/browser-core'
import type { ExposureConfiguration } from '../domain/configuration'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type { ExposureEvent } from '../exposureEvent.types'
import type { ExposureSessionManager } from '../domain/exposureSessionManager'

export function startExposureBatch(
  configuration: ExposureConfiguration,
  lifeCycle: LifeCycle,
  reportError: (error: RawError) => void,
  pageMayExitObservable: Observable<PageMayExitEvent>,
  session: ExposureSessionManager
) {
  const batch = startBatchWithReplica(
    configuration,
    {
      endpoint: configuration.exposureEndpointBuilder,
      encoder: createIdentityEncoder(),
    },
    configuration.replica && {
      endpoint: configuration.replica.exposureEndpointBuilder,
      encoder: createIdentityEncoder(),
    },
    reportError,
    pageMayExitObservable,
    session.expireObservable
  )

  lifeCycle.subscribe(LifeCycleEventType.EXPOSURE_COLLECTED, (serverExposureEvent: ExposureEvent & Context) => {
    batch.add(serverExposureEvent)
  })

  return batch
} 