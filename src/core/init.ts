import { buildConfiguration, UserConfiguration } from './configuration'
import { startErrorCollection } from './errorCollection'
import { setDebugMode, startInternalMonitoring } from './internalMonitoring'
import { startRequestCollection } from './requestCollection'
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

export function commonInit(userConfiguration: UserConfiguration) {
  const configuration = buildConfiguration(userConfiguration)
  const session = startSessionTracking()
  startInternalMonitoring(configuration, session)
  const errorObservable = startErrorCollection(configuration)

  return {
    configuration,
    errorObservable,
    session,
  }
}
