import type { RumInitConfiguration } from '@datadog/browser-rum-core'
import type { LogsInitConfiguration } from '@datadog/browser-logs'
import { DEFAULT_LOGS_CONFIGURATION, DEFAULT_RUM_CONFIGURATION } from '../helpers/configuration'

interface WorkerOptions {
  importScripts?: boolean
  // Run as a dedicated Web Worker (`new Worker()`) instead of a Service Worker
  dedicated?: boolean
}

export function createWorker(options: WorkerOptions = {}) {
  return new Worker(options)
}

export class Worker {
  public importScripts: boolean
  public dedicated: boolean
  public rumSdk: string | undefined
  public rumConfiguration: RumInitConfiguration | undefined
  public logsConfiguration: LogsInitConfiguration | undefined

  constructor({ importScripts = false, dedicated = false }: WorkerOptions = {}) {
    this.importScripts = importScripts
    this.dedicated = dedicated
  }

  // `sdk` selects the bundle loaded in the worker: `/datadog-<sdk>.js`
  withRum(rumInitConfiguration: Partial<RumInitConfiguration> = {}, { sdk }: { sdk?: string } = {}) {
    this.rumSdk = sdk
    this.rumConfiguration = { ...DEFAULT_RUM_CONFIGURATION, ...rumInitConfiguration }
    return this
  }

  withLogs(logsInitConfiguration: Partial<LogsInitConfiguration> = {}) {
    this.logsConfiguration = { ...DEFAULT_LOGS_CONFIGURATION, ...logsInitConfiguration }
    return this
  }
}
