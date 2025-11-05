import type { InitConfiguration, RelativeTime, SessionManager } from '@datadog/browser-core'
import type { LogsInitConfiguration } from '@datadog/browser-logs'
import type { RumInitConfiguration, SessionReplayState } from '@datadog/browser-rum-core'

export type CoreInitializeConfiguration = Omit<InitConfiguration, 'beforeSend'> & {
  workerUrl?: string
  rum?: Omit<RumInitConfiguration, Exclude<keyof InitConfiguration, 'beforeSend'>>
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  profiling?: {}
  logs?: Omit<LogsInitConfiguration, Exclude<keyof InitConfiguration, 'beforeSend'>>
}

export interface CoreSession {
  id: string
  sessionReplay: SessionReplayState
  anonymousId?: string
}

/**
 * This SessionManager is used to mimick the RumSessionManager and LogsSessionManager. This is a
 * temporary workaround while we are using legacy implementations that rely on the old
 * SessionManager.
 */
export interface CoreSessionManager {
  expire: SessionManager<string>['expire']
  expireObservable: SessionManager<string>['expireObservable']
  renewObservable: SessionManager<string>['renewObservable']
  setForcedReplay: () => void
  findTrackedSession: (startTime?: RelativeTime) => CoreSession | undefined
}
