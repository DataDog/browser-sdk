import { buildConfiguration, UserConfiguration } from './configuration'
import { areCookiesAuthorized, CookieOptions } from './cookie'
import { ErrorMessage, startErrorCollection } from './errorCollection'
import { setDebugMode, startInternalMonitoring } from './internalMonitoring'
import { Observable } from './observable'

export function makeGlobal<T>(stub: T): T & { onReady(callback: () => void): void } {
  const global = {
    ...stub,

    // This API method is intentionally not monitored, since the only thing executed is the
    // user-provided 'callback'.  All SDK usages executed in the callback should be monitored, and
    // we don't want to interfer with the user uncaught exceptions.
    onReady(callback: () => void) {
      callback()
    },
  }

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

export function defineGlobal<Global, Name extends keyof Global>(global: Global, name: Name, api: Global[Name]) {
  const existingGlobalVariable: { q?: Array<() => void> } | undefined = global[name]
  global[name] = api
  if (existingGlobalVariable && existingGlobalVariable.q) {
    existingGlobalVariable.q.forEach((fn) => fn())
  }
}

export enum Datacenter {
  US = 'us',
  EU = 'eu',
}

export const INTAKE_SITE = {
  [Datacenter.EU]: 'datadoghq.eu',
  [Datacenter.US]: 'datadoghq.com',
}

export enum BuildMode {
  RELEASE = 'release',
  STAGING = 'staging',
  E2E_TEST = 'e2e-test',
}

export interface BuildEnv {
  datacenter: Datacenter
  buildMode: BuildMode
  sdkVersion: string
}

export function commonInit(userConfiguration: UserConfiguration, buildEnv: BuildEnv, isCollectingError: boolean) {
  const configuration = buildConfiguration(userConfiguration, buildEnv)
  const internalMonitoring = startInternalMonitoring(configuration)
  const errorObservable = isCollectingError ? startErrorCollection(configuration) : new Observable<ErrorMessage>()

  return {
    configuration,
    errorObservable,
    internalMonitoring,
  }
}

export function checkCookiesAuthorized(options: CookieOptions) {
  if (!areCookiesAuthorized(options)) {
    console.warn('Cookies are not authorized, we will not send any data.')
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
