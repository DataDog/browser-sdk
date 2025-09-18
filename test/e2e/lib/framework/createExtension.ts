import type { RumInitConfiguration } from '@datadog/browser-rum-core'
import type test from '@playwright/test'
import type { LogsInitConfiguration } from '@datadog/browser-logs'
import { createExtensionTest } from '../helpers/extensionFixture'
import { DEFAULT_LOGS_CONFIGURATION, DEFAULT_RUM_CONFIGURATION } from '../helpers/configuration'

export function createExtension(path: string) {
  return new Extension(path)
}

// TODO: the recorder is lazy loaded and does not works in an browser extension content script
const DISABLE_SESSION_REPLAY_CONFIGURATION = { sessionReplaySampleRate: 0 }

export class Extension {
  public fixture: typeof test
  public rumConfiguration: RumInitConfiguration | undefined
  public logsConfiguration: LogsInitConfiguration | undefined

  constructor(path: string) {
    this.fixture = createExtensionTest(path)

    return this
  }

  withRum(rumInitConfiguration: Partial<RumInitConfiguration> = {}) {
    this.rumConfiguration = {
      ...DEFAULT_RUM_CONFIGURATION,
      ...DISABLE_SESSION_REPLAY_CONFIGURATION,
      ...rumInitConfiguration,
    }

    return this
  }

  withLogs(logsInitConfiguration: Partial<LogsInitConfiguration> = {}) {
    this.logsConfiguration = {
      ...DEFAULT_LOGS_CONFIGURATION,
      ...DISABLE_SESSION_REPLAY_CONFIGURATION,
      ...logsInitConfiguration,
    }

    return this
  }
}
