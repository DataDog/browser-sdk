type ValueOf<T> = T[keyof T]

type Message<Actions extends { [key: string]: any }> = ValueOf<{
  [K in keyof Actions]: {
    action: K
    payload: Actions[K]
  }
}>

export function createListenAction<Actions extends { [key: string]: any }>() {
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
  let onDisconnect: (() => void) | undefined

  function sendAction<K extends keyof Actions>(action: K, payload: Actions[K]) {
    try {
      chrome.runtime.sendMessage({ action, payload }).catch(handleError)
    } catch (error) {
      handleError(error)
    }
  }

  function handleError(error: any) {
    const message = typeof error === 'object' && error !== null ? String(error.message) : '(no message)'

    if (onDisconnect && message === 'Extension context invalidated.') {
      onDisconnect()
    } else if (
      message !== 'Could not establish connection. Receiving end does not exist.' &&
      message !== 'The message port closed before a response was received.'
    ) {
      console.error(`sendAction error: ${message}`)
    }
  }

  return {
    sendAction,
    setOnDisconnect: (newOnDisconnect: () => void) => {
      onDisconnect = newOnDisconnect
    },
  }
}
