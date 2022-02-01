import type { ClocksState } from '@datadog/browser-core'
import { instrumentMethodAndCallOriginal, clocksNow, formatConsoleParameters } from '@datadog/browser-core'
import type { StatusType } from './logger'

export const ApiName = {
  log: 'log',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
} as const

export const LogStatus = {
  log: 'info',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
} as const

export type ApiNameType = typeof ApiName[keyof typeof ApiName]

export interface ConsoleLog {
  message: string
  status: StatusType
  startClocks: ClocksState
}

export function trackConsoleLogs(apis: ApiNameType[], callback: (consoleLog: ConsoleLog) => void) {
  const proxies = apis.map((api) => startConsoleProxy(api, callback))
  return {
    stop: () => {
      proxies.forEach((proxy) => proxy.stop())
    },
  }
}

/* eslint-disable no-console */
function startConsoleProxy(api: ApiNameType, callback: (consoleLog: ConsoleLog) => void) {
  return instrumentMethodAndCallOriginal(console, api, {
    after: (...params: unknown[]) => callback(buildLogFromParams(params, api)),
  })
}

function buildLogFromParams(params: unknown[], api: ApiNameType): ConsoleLog {
  return {
    message: [`console ${api}:`, ...params].map((param) => formatConsoleParameters(param)).join(' '),
    status: LogStatus[api],
    startClocks: clocksNow(),
  }
}
