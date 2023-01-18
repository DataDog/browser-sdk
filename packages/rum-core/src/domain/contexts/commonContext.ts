import type { Context, ContextManager, User } from '@datadog/browser-core'
import type { RecorderApi } from '@datadog/browser-rum-core'

export interface CommonContext {
  user: User
  context: Context
  hasReplay?: true
}

export function getCommonContext(
  globalContextManager: ContextManager,
  userContextManager: ContextManager,
  recorderApi?: RecorderApi
): CommonContext {
  const commonContext: CommonContext = {
    context: globalContextManager.getContext(),
    user: userContextManager.getContext(),
  }

  if (recorderApi) {
    commonContext.hasReplay = recorderApi.isRecording() ? true : undefined
  }

  return commonContext
}
