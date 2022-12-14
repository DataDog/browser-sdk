import { createLogger } from '../common/logger'
import { createListenAction, createSendAction } from '../common/actions'
import type { BackgroundActions, PopupActions } from '../common/types'

const logger = createLogger('action')

export const listenAction = createListenAction<BackgroundActions>()
export const sendAction = createSendAction<PopupActions>((error) => {
  if (
    error.message !== 'Could not establish connection. Receiving end does not exist.' &&
    error.message !== 'The message port closed before a response was received.'
  ) {
    logger.error(`sendAction error: ${error.message}`)
  }
})
