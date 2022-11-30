import { createListenAction, createSendAction } from '../common/actions'
import type { BackgroundActions, PopupActions } from '../common/types'

export const listenAction = createListenAction<BackgroundActions>()
export const sendAction = createSendAction<PopupActions>().sendAction
