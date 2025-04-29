import { isError, computeRawError } from '../error/error'
import { mergeObservables, Observable } from '../../tools/observable'
import { ConsoleApiName, globalConsole } from '../../tools/display'
import { callMonitored } from '../../tools/monitor'
import { sanitize } from '../../tools/serialisation/sanitize'
import { jsonStringify } from '../../tools/serialisation/jsonStringify'
import type { RawError } from '../error/error.types'
import { ErrorHandling, ErrorSource, NonErrorPrefix } from '../error/error.types'
import { computeStackTrace } from '../../tools/stackTrace/computeStackTrace'
import { createHandlingStack, formatErrorMessage } from '../../tools/stackTrace/handlingStack'
import { clocksNow } from '../../tools/utils/timeUtils'

export type ConsoleLog = NonErrorConsoleLog | ErrorConsoleLog

interface NonErrorConsoleLog extends ConsoleLogBase {
  api: Exclude<ConsoleApiName, typeof ConsoleApiName.error>
  error: undefined
}

export interface ErrorConsoleLog extends ConsoleLogBase {
  api: typeof ConsoleApiName.error
  error: RawError
}

interface ConsoleLogBase {
  message: string
  api: ConsoleApiName
  handlingStack: string
}

type ConsoleLogForApi<T extends ConsoleApiName> = T extends typeof ConsoleApiName.error
  ? ErrorConsoleLog
  : NonErrorConsoleLog

let consoleObservablesByApi: { [K in ConsoleApiName]?: Observable<ConsoleLogForApi<K>> } = {}

export function initConsoleObservable<T extends ConsoleApiName[]>(apis: T): Observable<ConsoleLogForApi<T[number]>> {
  const consoleObservables = apis.map((api) => {
    if (!consoleObservablesByApi[api]) {
      consoleObservablesByApi[api] = createConsoleObservable(api) as any // we are sure that the observable created for this api will yield the expected ConsoleLog type
    }
    return consoleObservablesByApi[api] as unknown as Observable<ConsoleLogForApi<T[number]>>
  })

  return mergeObservables(...consoleObservables)
}

export function resetConsoleObservable() {
  consoleObservablesByApi = {}
}

function createConsoleObservable(api: ConsoleApiName) {
  return new Observable<ConsoleLog>((observable) => {
    const originalConsoleApi = globalConsole[api]

    globalConsole[api] = (...params: unknown[]) => {
      originalConsoleApi.apply(console, params)
      const handlingStack = createHandlingStack('console error')

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

  if (api === ConsoleApiName.error) {
    const firstErrorParam = params.find(isError)

    const rawError = computeRawError({
      originalError: firstErrorParam,
      handlingStack,
      startClocks: clocksNow(),
      source: ErrorSource.CONSOLE,
      handling: ErrorHandling.HANDLED,
      nonErrorPrefix: NonErrorPrefix.PROVIDED,

      // if no good stack is computed from the error, let's not use the fallback stack message
      // advising the user to use an instance of Error, as console.error is commonly used without an
      // Error instance.
      useFallbackStack: false,
    })

    // Use the full log message as the error message instead of just the error instance message.
    rawError.message = message

    return {
      api,
      message,
      handlingStack,
      error: rawError,
    }
  }

  return {
    api,
    message,
    error: undefined,
    handlingStack,
  }
}

function formatConsoleParameters(param: unknown) {
  if (typeof param === 'string') {
    return sanitize(param)
  }
  if (isError(param)) {
    return formatErrorMessage(computeStackTrace(param))
  }
  return jsonStringify(sanitize(param), undefined, 2)
}
