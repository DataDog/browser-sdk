import { CoreContextType as CoreContextType, getInternalApi, MessageType } from '@datadog/browser-internal-next'
import { addEventListener } from '@datadog/browser-core'

export { initialize } from '../initialize'

// TODO: move this somewhere else
// We don't use `trackRuntimeError` from browser-core because we don't want to deal with raw errors
// parsing at this layer.
// Also, let's try to use event listeners instead of intstrumenting handlers, as it sounds cleaner
// and smaller than bringing instrumentation tooling.
function trackRuntimeErrors() {
  addEventListener({}, globalThis, 'error', (event) => {
    getInternalApi().notify({
      type: MessageType.RUNTIME_ERROR,
      error: event.error,
      event,
    })
  })

  addEventListener({}, globalThis, 'unhandledrejection', (event) => {
    getInternalApi().notify({
      type: MessageType.RUNTIME_ERROR,
      error: event.reason || 'Empty reason',
    })
  })
}

trackRuntimeErrors()

export function setGlobalContext(value: object) {
  setContext(CoreContextType.GLOBAL, value)
}

export function setGlobalContextProperty(key: string, value: unknown) {
  setContextProperty(CoreContextType.GLOBAL, key, value)
}

export function clearGlobalContext() {
  clearContext(CoreContextType.GLOBAL)
}

export function setAccount(value: object) {
  setContext(CoreContextType.ACCOUNT, value)
}

export function setAccountProperty(key: string, value: unknown) {
  setContextProperty(CoreContextType.ACCOUNT, key, value)
}

export function clearAccount() {
  clearContext(CoreContextType.ACCOUNT)
}

export function setUser(user: object) {
  setContext(CoreContextType.USER, user)
}

export function setUserProperty(key: string, value: unknown) {
  setContextProperty(CoreContextType.USER, key, value)
}

export function clearUser() {
  clearContext(CoreContextType.USER)
}

function setContext(context: CoreContextType, value: object) {
  getInternalApi().notify({ type: MessageType.CORE_SET_CONTEXT, context, value })
}

function setContextProperty(context: CoreContextType, key: string, value: unknown) {
  getInternalApi().notify({ type: MessageType.CORE_SET_CONTEXT_PROPERTY, context, key, value })
}

function clearContext(context: CoreContextType) {
  getInternalApi().notify({ type: MessageType.CORE_CLEAR_CONTEXT, context })
}
