import type { Context } from '@datadog/browser-core'
import { getEventBridge } from '@datadog/browser-core'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type { ExposureEvent } from '../exposureEvent.types'

export function startExposureBridge(lifeCycle: LifeCycle) {
  const bridge = getEventBridge<'exposure', ExposureEvent>()!

  lifeCycle.subscribe(LifeCycleEventType.EXPOSURE_COLLECTED, (serverExposureEvent: ExposureEvent & Context) => {
    bridge.send('exposure', serverExposureEvent)
  })
} 