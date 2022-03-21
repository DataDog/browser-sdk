type ValueOf<T> = T[keyof T]

type Message<Actions extends { [key: string]: any }> = ValueOf<{
  [K in keyof Actions]: {
    action: K
    payload: Actions[K]
  }
}>

export function createListenAction<Actions>() {
  function listenAction<K extends keyof Actions>(
    action: K,
    callback: (payload: Actions[K], tabId: number | undefined) => void
  ) {
    const listener = (message: Message<Actions>, sender: chrome.runtime.MessageSender) => {
      if (message.action === action) {
        callback((message as Message<Pick<Actions, K>>).payload, sender.tab?.id)
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => {
      chrome.runtime.onMessage.removeListener(listener)
    }
  }

  return listenAction
}

export function createSendAction<Actions>() {
  function sendAction<K extends keyof Actions>(action: K, payload: Actions[K]) {
    return chrome.runtime.sendMessage({ action, payload }, () => {
      const error = chrome.runtime.lastError
      if (
        error &&
        error.message !== 'Could not establish connection. Receiving end does not exist.' &&
        error.message !== 'The message port closed before a response was received.'
      ) {
        console.error(`sendAction error: ${String(error.message)}`)
      }
    })
  }

  return sendAction
}
