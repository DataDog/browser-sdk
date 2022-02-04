import { callMonitored } from '../domain/internalMonitoring'
import { computeStackTrace } from '../domain/tracekit'
import { createHandlingStack, ErrorSource, formatErrorMessage, toStackTraceString } from '../tools/error'
import { mergeObservables, Observable } from '../tools/observable'
import type { ClocksState } from '../tools/timeUtils'
import { clocksNow } from '../tools/timeUtils'
import { find, jsonStringify } from '../tools/utils'

const StatusType = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
} as const

type StatusType = typeof StatusType[keyof typeof StatusType]

type ApiNameType = 'log' | 'debug' | 'info' | 'warn' | 'error'

const LogStatusForApi = {
  log: StatusType.info,
  debug: StatusType.debug,
  info: StatusType.info,
  warn: StatusType.warn,
  error: StatusType.error,
}

export interface ConsoleLog {
  startClocks: ClocksState
  message: string
  status: StatusType
  source: 'console'
  stack?: string
  handlingStack?: string
}

const consoleObservables: { [k in ApiNameType]?: Observable<ConsoleLog> } = {}

export function initConsoleObservable(apis: ApiNameType[]) {
  const observables = apis.map((api) => {
    if (!consoleObservables[api]) {
      consoleObservables[api] = createConsoleObservable(api)
    }
    return consoleObservables[api]!
  })

  return mergeObservables<ConsoleLog>(...observables)
}

/* eslint-disable no-console */
function createConsoleObservable(api: ApiNameType) {
  const observable = new Observable<ConsoleLog>(() => {
    const originalConsoleApi = console[api]

    console[api] = (...params: unknown[]) => {
      const handlingStack = createHandlingStack()
      callMonitored(() => {
        originalConsoleApi.apply(console, params)
        observable.notify(buildConsoleLog(params, api, handlingStack))
      })
    }

    return () => {
      console[api] = originalConsoleApi
    }
  })

  return observable
}

function buildConsoleLog(params: unknown[], api: ApiNameType, handlingStack: string): ConsoleLog {
  const log: ConsoleLog = {
    message: [`console ${api}:`, ...params].map((param) => formatConsoleParameters(param)).join(' '),
    status: LogStatusForApi[api],
    source: ErrorSource.CONSOLE,
    startClocks: clocksNow(),
  }

  if (api === StatusType.error) {
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
