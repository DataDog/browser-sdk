import type { RumInitConfiguration } from '@datadog/browser-rum-core'
import type { LogsInitConfiguration } from '@datadog/browser-logs'
import { DEFAULT_LOGS_CONFIGURATION, DEFAULT_RUM_CONFIGURATION } from '../helpers/configuration'

interface WorkerOptions {
  importScripts?: boolean
  nativeLog?: boolean
}

export function createWorker(options: WorkerOptions = {}) {
  return new Worker(options)
}

export class Worker {
  public importScripts: boolean
  public nativeLog: boolean
  public rumConfiguration: RumInitConfiguration | undefined
  public logsConfiguration: LogsInitConfiguration | undefined

  constructor({ importScripts = false, nativeLog = false }: WorkerOptions = {}) {
    this.importScripts = importScripts
    this.nativeLog = nativeLog
  }

  withRum(rumInitConfiguration: Partial<RumInitConfiguration> = {}) {
    this.rumConfiguration = { ...DEFAULT_RUM_CONFIGURATION, ...rumInitConfiguration }
    return this
  }

  withLogs(logsInitConfiguration: Partial<LogsInitConfiguration> = {}) {
    this.logsConfiguration = { ...DEFAULT_LOGS_CONFIGURATION, ...logsInitConfiguration }
    return this
  }
}
