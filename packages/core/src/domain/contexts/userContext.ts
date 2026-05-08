import type { AbstractHooks } from '../../tools/abstractHooks'
import { CustomerDataType } from '../context/contextConstants'
import { storeContextManager } from '../context/storeContextManager'
import { HookNames, SKIPPED } from '../../tools/abstractHooks'
import { createContextManager } from '../context/contextManager'
import type { Configuration } from '../configuration'
import { isEmptyObject } from '../../tools/utils/objectUtils'
import type { RelativeTime } from '../../tools/utils/timeUtils'

export interface User {
  id?: string | undefined
  email?: string | undefined
  name?: string | undefined
  [key: string]: unknown
}

export function startUserContext(
  hooks: AbstractHooks,
  configuration: Configuration,
  sessionManager: {
    findTrackedSession: (startTime?: RelativeTime) => { anonymousId?: string } | undefined
  },
  productKey: string
) {
  const userContextManager = buildUserContextManager()

  if (configuration.storeContextsAcrossPages) {
    storeContextManager(configuration, userContextManager, productKey, CustomerDataType.User)
  }

  hooks.register(HookNames.Assemble, ({ eventType, startTime }) => {
    const user = userContextManager.getContext()
    const session = sessionManager.findTrackedSession(startTime)

    if (session && session.anonymousId && !user.anonymous_id && !!configuration.trackAnonymousUser) {
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
