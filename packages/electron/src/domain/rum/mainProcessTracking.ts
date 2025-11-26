import type { RumConfiguration, RumViewEvent } from '@datadog/browser-rum-core'
import { RumEventType } from '@datadog/browser-rum-core'
import type { Observable } from '@datadog/browser-core'
import { HookNames, timeStampNow, combine, toServerDuration, elapsed } from '@datadog/browser-core'
import type { Hooks } from '../../hooks'
import type { CollectedRumEvent } from './events'

const NODE_VIEW_NAME = 'ApplicationLaunch'

export function startMainProcessTracking(
  hooks: Hooks,
  configuration: RumConfiguration,
  sessionId: string,
  mainProcessViewId: string,
  onRumEventObservable: Observable<CollectedRumEvent>,
  onActivityObservable: Observable<void>
) {
  const mainProcessContext = {
    sessionId,
    viewId: mainProcessViewId,
  }
  hooks.register(HookNames.Assemble, ({ eventType }) => ({
    type: eventType,
    application: {
      id: configuration.applicationId,
    },
    session: {
      id: mainProcessContext.sessionId,
    },
    view: {
      id: mainProcessContext.viewId,
      url: NODE_VIEW_NAME,
    },
    service: configuration.service,
    env: configuration.env,
    version: configuration.version,
  }))
  hooks.register(HookNames.AssembleTelemetry, () => ({
    application: {
      id: configuration.applicationId,
    },
    session: {
      id: mainProcessContext.sessionId,
    },
  }))
  console.log('sessionId', mainProcessContext.sessionId)
  console.log(
    '\x1b[34m%s\x1b[0m',
    `https://app.datadoghq.com/rum/sessions?query=%40type%3Asession%20%40session.id%3A${mainProcessContext.sessionId}`
  )
  console.log(
    '\x1b[34m%s\x1b[0m',
    `https://app.datadoghq.com/apm/traces?query=%40_dd.session.id%3A${mainProcessContext.sessionId}`
  )
  const applicationStart = timeStampNow()
  let applicationLaunch = {
    type: RumEventType.VIEW,
    date: applicationStart as number,
    view: {
      id: mainProcessContext.viewId,
      is_active: true,
      name: NODE_VIEW_NAME,
      time_spent: 0,
      // TODO update counters
      action: {
        count: 0,
      },
      resource: {
        count: 0,
      },
      error: {
        count: 0,
      },
    },
    _dd: {
      document_version: 0,
    },
  } as RumViewEvent

  onRumEventObservable.subscribe(({ event, source }) => {
    if (source === 'renderer') {
      return
    }
    switch (event.type) {
      case RumEventType.RESOURCE:
        ;(applicationLaunch.view.resource.count as any) += 1
        updateView()
        break
      case RumEventType.ERROR:
        ;(applicationLaunch.view.error.count as any) += 1
        updateView()
        break
    }
  })

  updateView()
  onActivityObservable.subscribe(updateView)

  function updateView() {
    applicationLaunch = combine(applicationLaunch, {
      view: {
        time_spent: toServerDuration(elapsed(applicationStart, timeStampNow())),
      },
      _dd: {
        document_version: applicationLaunch._dd.document_version + 1,
      },
    })
    onRumEventObservable.notify({ event: applicationLaunch, source: 'main-process' })
  }
  // TODO session expiration / renewal
  // TODO useragent
}
