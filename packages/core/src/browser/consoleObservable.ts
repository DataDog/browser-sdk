import { callMonitored } from '../domain/internalMonitoring'
import { computeStackTrace } from '../domain/tracekit'
import { createHandlingStack, formatErrorMessage, toStackTraceString } from '../tools/error'
import { mergeObservables, Observable } from '../tools/observable'
import { find, jsonStringify } from '../tools/utils'

export const ConsoleApiName = {
  log: 'log',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
} as const

export type ConsoleApiName = typeof ConsoleApiName[keyof typeof ConsoleApiName]

export const CONSOLE_APIS = Object.keys(ConsoleApiName) as ConsoleApiName[]

export interface ConsoleLog {
  message: string
  apiName: ConsoleApiName
  stack?: string
  handlingStack?: string
}

const consoleObservables: { [k in ConsoleApiName]?: Observable<ConsoleLog> } = {}

export function initConsoleObservable(apis: ConsoleApiName[]) {
  const observables = apis.map((api) => {
    if (!consoleObservables[api]) {
      consoleObservables[api] = createConsoleObservable(api)
    }
    return consoleObservables[api]!
  })

  return mergeObservables<ConsoleLog>(...observables)
}

/* eslint-disable no-console */
function createConsoleObservable(api: ConsoleApiName) {
  const observable = new Observable<ConsoleLog>(() => {
    const originalConsoleApi = console[api]

    console[api] = (...params: unknown[]) => {
      originalConsoleApi.apply(console, params)
      const handlingStack = createHandlingStack()

      callMonitored(() => {
        observable.notify(buildConsoleLog(params, api, handlingStack))
      })
    }

    return () => {
      console[api] = originalConsoleApi
    }
  })

  return observable
}

function buildConsoleLog(params: unknown[], apiName: ConsoleApiName, handlingStack: string): ConsoleLog {
  const log: ConsoleLog = {
    message: [`console ${apiName}:`, ...params].map((param) => formatConsoleParameters(param)).join(' '),
    apiName,
  }

  if (apiName === ConsoleApiName.error) {
    const firstErrorParam = find(params, (param: unknown): param is Error => param instanceof Error)
    log.stack = firstErrorParam ? toStackTraceString(computeStackTrace(firstErrorParam)) : undefined
    log.handlingStack = handlingStack
  }

  return log
}

function formatConsoleParameters(param: unknown) {
  if (typeof param === 'string') {
    return param
  }
  if (param instanceof Error) {
    return formatErrorMessage(computeStackTrace(param))
  }
  return jsonStringify(param, undefined, 2)
}
