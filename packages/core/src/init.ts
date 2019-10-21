import { buildConfiguration, UserConfiguration } from './configuration'
import { startErrorCollection } from './errorCollection'
import { setDebugMode, startInternalMonitoring } from './internalMonitoring'

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

export function commonInit(userConfiguration: UserConfiguration, version: string) {
  const configuration = buildConfiguration(userConfiguration, version)
  startInternalMonitoring(configuration)
  const errorObservable = startErrorCollection(configuration)

  return {
    configuration,
    errorObservable,
  }
}
