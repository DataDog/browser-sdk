import { callMonitored } from '../internalMonitoring'
import { computeStackTrace } from '../tracekit'
import { createHandlingStack, formatErrorMessage, toStackTraceString } from '../../tools/error'
import { mergeObservables, Observable } from '../../tools/observable'
import { find, jsonStringify } from '../../tools/utils'

export const ConsoleApiName = {
  log: 'log',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
} as const

export type ConsoleApiName = typeof ConsoleApiName[keyof typeof ConsoleApiName]

export interface ConsoleLog {
  message: string
  api: ConsoleApiName
  stack?: string
  handlingStack?: string
}

const consoleObservablesByApi: { [k in ConsoleApiName]?: Observable<ConsoleLog> } = {}

export function initConsoleObservable(apis: ConsoleApiName[]) {
  const consoleObservables = apis.map((api) => {
    if (!consoleObservablesByApi[api]) {
      consoleObservablesByApi[api] = createConsoleObservable(api)
    }
    return consoleObservablesByApi[api]!
  })

  return mergeObservables<ConsoleLog>(...consoleObservables)
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

function buildConsoleLog(params: unknown[], api: ConsoleApiName, handlingStack: string): ConsoleLog {
  const log: ConsoleLog = {
    message: [`console ${api}:` as unknown]
      .concat(params)
      .map((param) => formatConsoleParameters(param))
      .join(' '),
    api,
  }

  if (api === ConsoleApiName.error) {
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
