import { createLogger } from '../common/logger'
import { createListenAction, createSendAction } from '../common/actions'
import type { BackgroundActions, PopupActions } from '../common/types'
import { isDisconnectError } from '../common/isDisconnectError'
import { notifyDisconnectEvent } from './disconnectEvent'

const logger = createLogger('action')

export const sendAction = createSendAction<BackgroundActions>((error) => {
  if (isDisconnectError(error)) {
    notifyDisconnectEvent()
  } else {
    logger.error('sendAction error:', error.message)
  }
})
export const listenAction = createListenAction<PopupActions>()
