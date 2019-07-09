import { buildConfiguration, UserConfiguration } from './configuration'
import { startErrorCollection } from './errorCollection'
import { setDebugMode, startInternalMonitoring } from './internalMonitoring'
import { startSessionTracking } from './session'

export function makeStub(methodName: string) {
  console.warn(`'${methodName}' not yet available, please call '.init()' first.`)
}

export function makeGlobal<T>(stub: T): T {
  const global = { ...stub }

  // Add an "hidden" property to set debug mode. We define it that way to hide it
  // as much as possible but of course it's not a real protection.
  Object.defineProperty(global, '_setDebug', {
    get() {
      return setDebugMode
    },
    enumerable: false,
  })

  return global
}

export const SECOND_INIT_WARNING_MESSAGE = 'Script was already initialized'
let initialized = false

export function commonInit(userConfiguration: UserConfiguration) {
  if (initialized) {
    console.warn(SECOND_INIT_WARNING_MESSAGE)
  }
  initialized = true

  const configuration = buildConfiguration(userConfiguration)
  startInternalMonitoring(configuration)
  startSessionTracking()
  const errorObservable = startErrorCollection(configuration)

  return {
    configuration,
    errorObservable,
  }
}
