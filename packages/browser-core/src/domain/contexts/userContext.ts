import type { RelativeTime } from '@datadog/js-core/time'
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

  hook.register(({ eventType, startTime }) => {
    const user = userContextManager.getContext()
    const session = sessionManager.findTrackedSession(startTime)

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

  return userContextManager
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
