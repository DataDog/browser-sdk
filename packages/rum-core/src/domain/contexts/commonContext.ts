import type { Context, User } from '@datadog/browser-core'
import type { RecorderApi } from '../../boot/rumPublicApi'
import type { GlobalContext } from './globalContext'
import type { UserContext } from './userContext'
import type { AccountContext } from './accountContext'

export interface CommonContext {
  user: User
  // We don't want to enforce id internally so use Context as internal type
  account: Context
  context: Context
  hasReplay: true | undefined
}

export function buildCommonContext(
  globalContextManager: GlobalContext,
  userContextManager: UserContext,
  accountContextManager: AccountContext,
  recorderApi: RecorderApi
): CommonContext {
  return {
    context: globalContextManager.getGlobalContext(),
    user: userContextManager.getUser(),
    account: accountContextManager.getAccount(),
    hasReplay: recorderApi.isRecording() ? true : undefined,
  }
}
