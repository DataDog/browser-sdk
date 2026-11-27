import type { RelativeTime } from '@datadog/js-core/time'
import type { Context } from '@datadog/js-core/util'
import type { Hook } from '@datadog/js-core/assembly'
import { SKIPPED } from '@datadog/js-core/assembly'
import { CustomerDataType } from '../context/contextConstants'
import { storeContextManager } from '../context/storeContextManager'
import { createContextManager } from '../context/contextManager'
import type { Configuration } from '../configuration'
import { isEmptyObject } from '../../tools/utils/objectUtils'

export interface User {
  id?: string | undefined
  email?: string | undefined
  name?: string | undefined
  [key: string]: unknown
}

export function startUserContext(
  hook: Hook<{ eventType?: string; startTime: RelativeTime }, { usr?: User }>,
  configuration: Configuration,
  sessionManager: {
    findTrackedSession: (startTime?: RelativeTime) => { anonymousId?: string } | undefined
  },
  productKey: string
) {
  const userContextManager = buildUserContextManager()

  if (configuration.storeContextsAcrossPages) {
    storeContextManager(userContextManager, productKey, CustomerDataType.User)
  }

  startUserContextHook(hook, configuration, sessionManager, userContextManager.getContext)

  return userContextManager
}

export function startUserContextHook(
  hook: Hook<{ eventType?: string; startTime: RelativeTime }, { usr?: User }>,
  configuration: Configuration,
  sessionManager: {
    findTrackedSession: (
      startTime?: RelativeTime,
      options?: { sampleRate?: number }
    ) => { anonymousId?: string } | undefined
  },
  getUser: () => Context
) {
  hook.register(({ eventType, startTime }) => {
    const user = getUser()
    // In the Logs plugin, the session manager is RUM's and defaults to RUM's rate, so pass the configured one
    const session = sessionManager.findTrackedSession(startTime, { sampleRate: configuration.sessionSampleRate })

    if (session?.anonymousId && !user.anonymous_id && !!configuration.trackAnonymousUser) {
      user.anonymous_id = session.anonymousId
    }

    if (isEmptyObject(user)) {
      return SKIPPED
    }

    return {
      type: eventType,
      usr: user,
    }
  })
}

export function buildUserContextManager() {
  return createContextManager('user', {
    propertiesConfig: {
      id: { type: 'string' },
      name: { type: 'string' },
      email: { type: 'string' },
    },
  })
}
