import type { RumConfiguration, RumViewEvent } from '@datadog/browser-rum-core'
import { RumEventType } from '@datadog/browser-rum-core'
import type { Observable } from '@datadog/browser-core'
import { SKIPPED, HookNames, timeStampNow, combine, toServerDuration, elapsed } from '@datadog/browser-core'
import type { Hooks } from '../../hooks'
import type { SessionManager } from '../session/manager'
import type { CollectedRumEvent } from './events'

const NODE_VIEW_NAME = 'ApplicationLaunch'

export function startMainProcessTracking(
  hooks: Hooks,
  configuration: RumConfiguration,
  sessionManager: SessionManager,
  mainProcessViewId: string,
  onRumEventObservable: Observable<CollectedRumEvent>,
  onActivityObservable: Observable<void>
) {
  let currentSessionId = sessionManager.getSession()?.id

  // Subscribe to session changes to update session ID
  sessionManager.stateObservable.subscribe(({ id: sessionId }) => {
    currentSessionId = sessionId
  })

  const mainProcessContext = {
    viewId: mainProcessViewId,
  }

  hooks.register(HookNames.Assemble, ({ eventType, ...event }) => {
    if ('session' in event) {
      return SKIPPED
    }

    return {
      type: eventType,
      application: {
        id: configuration.applicationId,
      },
      session: {
        id: currentSessionId,
      },
      view: {
        id: mainProcessContext.viewId,
        url: NODE_VIEW_NAME,
      },
      service: configuration.service,
      env: configuration.env,
      version: configuration.version,
    }
  })
  hooks.register(HookNames.AssembleTelemetry, () => ({
    application: {
      id: configuration.applicationId,
    },
    session: {
      id: sessionManager.getSession()?.id,
    },
  }))
  console.log('sessionId', currentSessionId)
  console.log(
    '\x1b[34m%s\x1b[0m',
    `https://app.datadoghq.com/rum/sessions?query=%40type%3Asession%20%40session.id%3A${currentSessionId}`
  )
  console.log('\x1b[34m%s\x1b[0m', `https://app.datadoghq.com/apm/traces?query=%40_dd.session.id%3A${currentSessionId}`)
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
