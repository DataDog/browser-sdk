import { setDebugMode } from '../domain/internalMonitoring'
import { catchUserErrors } from '../tools/catchUserErrors'

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
  CANARY = 'canary',
  E2E_TEST = 'e2e-test',
}

export interface BuildEnv {
  buildMode: BuildMode
  sdkVersion: string
}
