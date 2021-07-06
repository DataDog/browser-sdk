import { areCookiesAuthorized, CookieOptions } from '../browser/cookie'
import { buildConfiguration, InitConfiguration } from '../domain/configuration'
import { setDebugMode, startInternalMonitoring } from '../domain/internalMonitoring'
import { Datacenter } from '../domain/transportConfiguration'
import { catchUserErrors } from '../tools/catchUserErrors'
import { display } from '../tools/display'

export function makePublicApi<T>(stub: T): T & { onReady(callback: () => void): void } {
  const publicApi = {
    ...stub,

    // This API method is intentionally not monitored, since the only thing executed is the
    // user-provided 'callback'.  All SDK usages executed in the callback should be monitored, and
    // we don't want to interfere with the user uncaught exceptions.
    onReady(callback: () => void) {
      callback()
    },
  }

  // Add an "hidden" property to set debug mode. We define it that way to hide it
  // as much as possible but of course it's not a real protection.
  Object.defineProperty(publicApi, '_setDebug', {
    get() {
      return setDebugMode
    },
    enumerable: false,
  })

  return publicApi
}

export function defineGlobal<Global, Name extends keyof Global>(global: Global, name: Name, api: Global[Name]) {
  const existingGlobalVariable: { q?: Array<() => void> } | undefined = global[name]
  global[name] = api
  if (existingGlobalVariable && existingGlobalVariable.q) {
    existingGlobalVariable.q.forEach((fn) => catchUserErrors(fn, 'onReady callback threw an error:')())
  }
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

export function commonInit(initConfiguration: InitConfiguration, buildEnv: BuildEnv) {
  const configuration = buildConfiguration(initConfiguration, buildEnv)
  const internalMonitoring = startInternalMonitoring(configuration)

  return {
    configuration,
    internalMonitoring,
  }
}

export function checkCookiesAuthorized(options: CookieOptions) {
  if (!areCookiesAuthorized(options)) {
    display.warn('Cookies are not authorized, we will not send any data.')
    return false
  }
  return true
}

export function checkIsNotLocalFile() {
  if (isLocalFile()) {
    display.error('Execution is not allowed in the current context.')
    return false
  }
  return true
}

function isLocalFile() {
  return window.location.protocol === 'file:'
}
