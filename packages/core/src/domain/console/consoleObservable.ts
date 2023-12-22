import { createHandlingStack, formatErrorMessage, toStackTraceString, tryToGetFingerprint } from '../error/error'
import { mergeObservables, Observable } from '../../tools/observable'
import { ConsoleApiName, globalConsole } from '../../tools/display'
import { callMonitored } from '../../tools/monitor'
import { sanitize } from '../../tools/serialisation/sanitize'
import { find } from '../../tools/utils/polyfills'
import { jsonStringify } from '../../tools/serialisation/jsonStringify'
import { computeStackTrace } from '../error/computeStackTrace'

export interface ConsoleLog {
  message: string
  api: ConsoleApiName
  stack?: string
  handlingStack?: string
  fingerprint?: string
}

let consoleObservablesByApi: { [k in ConsoleApiName]?: Observable<ConsoleLog> } = {}

export function initConsoleObservable(apis: ConsoleApiName[]) {
  const consoleObservables = apis.map((api) => {
    if (!consoleObservablesByApi[api]) {
      consoleObservablesByApi[api] = createConsoleObservable(api)
    }
    return consoleObservablesByApi[api]!
  })

  return mergeObservables<ConsoleLog>(...consoleObservables)
}

export function resetConsoleObservable() {
  consoleObservablesByApi = {}
}

function createConsoleObservable(api: ConsoleApiName) {
  return new Observable<ConsoleLog>((observable) => {
    const originalConsoleApi = globalConsole[api]

    globalConsole[api] = (...params: unknown[]) => {
      originalConsoleApi.apply(console, params)
      const handlingStack = createHandlingStack()

      callMonitored(() => {
        observable.notify(buildConsoleLog(params, api, handlingStack))
      })
    }

    return () => {
      globalConsole[api] = originalConsoleApi
    }
  })
}

function buildConsoleLog(params: unknown[], api: ConsoleApiName, handlingStack: string): ConsoleLog {
  const message = params.map((param) => formatConsoleParameters(param)).join(' ')
  let stack
  let fingerprint

  if (api === ConsoleApiName.error) {
    const firstErrorParam = find(params, (param: unknown): param is Error => param instanceof Error)
    stack = firstErrorParam ? toStackTraceString(computeStackTrace(firstErrorParam)) : undefined
    fingerprint = tryToGetFingerprint(firstErrorParam)
  }

  return {
    api,
    message,
    stack,
    handlingStack,
    fingerprint,
  }
}

function formatConsoleParameters(param: unknown) {
  if (typeof param === 'string') {
    return sanitize(param)
  }
  if (param instanceof Error) {
    return formatErrorMessage(computeStackTrace(param))
  }
  return jsonStringify(sanitize(param), undefined, 2)
}
