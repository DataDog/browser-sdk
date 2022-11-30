import { createListenAction, createSendAction } from '../common/actions'
import type { BackgroundActions, PopupActions } from '../common/types'

const { sendAction, setOnDisconnect } = createSendAction<BackgroundActions>()
export { sendAction, setOnDisconnect }
export const listenAction = createListenAction<PopupActions>()
