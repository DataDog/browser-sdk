import type { Context, ContextManager, User } from '@datadog/browser-core'
import type { RecorderApi } from '../../boot/rumPublicApi'

export interface CommonContext {
  user: User
  // We don't want to enforce id internally so use Context as internal type
  account: Context
  context: Context
  hasReplay: true | undefined
}

export function buildCommonContext(
  globalContextManager: ContextManager,
  userContextManager: ContextManager,
  accountContextManager: ContextManager,
  recorderApi: RecorderApi
): CommonContext {
  return {
    context: globalContextManager.getContext(),
    user: userContextManager.getContext(),
    account: accountContextManager.getContext(),
    hasReplay: recorderApi.isRecording() ? true : undefined,
  }
}
