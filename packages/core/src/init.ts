import { buildConfiguration, UserConfiguration } from './configuration'
import { areCookiesAuthorized } from './cookie'
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

export type Datacenter = 'eu' | 'us'
export type Environment = 'production' | 'staging' | 'e2e-test'

export interface BuildEnv {
  datacenter: Datacenter
  env: Environment
  version: string
}

export function commonInit(userConfiguration: UserConfiguration, buildEnv: BuildEnv) {
  const configuration = buildConfiguration(userConfiguration, buildEnv)
  const internalMonitoring = startInternalMonitoring(configuration)
  const errorObservable = startErrorCollection(configuration)

  return {
    configuration,
    errorObservable,
    internalMonitoring,
  }
}

export function checkCookiesAuthorized() {
  if (!areCookiesAuthorized()) {
    console.error('Cookies are not authorized, we will not send any data.')
    return false
  }
  return true
}

export function checkIsNotLocalFile() {
  if (isLocalFile()) {
    console.error('Execution is not allowed in the current context.')
    return false
  }
  return true
}

function isLocalFile() {
  return window.location.protocol === 'file:'
}
