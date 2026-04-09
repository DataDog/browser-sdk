import { useEffect, useState } from 'react'
import type { RumInternalContext, Context } from '@datadog/browser-core'
import type { LogsInitConfiguration } from '@datadog/browser-logs'
import type { RumInitConfiguration } from '@datadog/browser-rum'
import { createLogger } from '../../common/logger'
import { evalInWindow } from '../evalInWindow'
import { computeLogsTrackingType, computeRumTrackingType } from '../sampler'

const logger = createLogger('useSdkInfos')

const REFRESH_INFOS_INTERVAL = 2000

export interface SdkInfos {
  rum?: {
    version?: string
    config?: RumInitConfiguration
    internalContext?: RumInternalContext
    globalContext?: Context
    user: Context
  }
  logs?: {
    version?: string
    config?: LogsInitConfiguration
    globalContext?: Context
    user: Context
  }
  cookie?: {
    id?: string
    created?: string
    expire?: string
    logs?: string
    rum?: string
    forcedReplay?: '1'
  }
  sessionCookieName?: string
  rumTrackingType?: string
  logsTrackingType?: string
}

export function useSdkInfos() {
  const [infos, setInfos] = useState<SdkInfos | undefined>()

  useEffect(() => {
    function refreshInfos() {
      void getInfos().then((newInfos) =>
        setInfos((previousInfos) => (deepEqual(previousInfos, newInfos) ? previousInfos : newInfos))
      )
    }
    refreshInfos()
    const id = setInterval(refreshInfos, REFRESH_INFOS_INTERVAL)
    return () => clearInterval(id)
  }, [])

  return infos
}

async function getInfos(): Promise<SdkInfos> {
  let raw: SdkInfos
  try {
    raw = (await evalInWindow(
      `
        // Helper to serialize objects while preserving function metadata
        function serializeWithFunctions(obj) {
          return JSON.parse(JSON.stringify(obj, function(key, value) {
            if (typeof value === 'function') {
              return {
                __type: 'function',
                __name: value.name || '(anonymous)',
                __source: value.toString()
              }
            }
            return value
          }))
        }

        const rum = window.DD_RUM && {
          version: window.DD_RUM?.version,
          config: serializeWithFunctions(window.DD_RUM?.getInitConfiguration?.()),
          internalContext: window.DD_RUM?.getInternalContext?.(),
          globalContext: window.DD_RUM?.getGlobalContext?.(),
          user: window.DD_RUM?.getUser?.(),
        }
        const logs = window.DD_LOGS && {
          version: window.DD_LOGS?.version,
          config: serializeWithFunctions(window.DD_LOGS?.getInitConfiguration?.()),
          globalContext: window.DD_LOGS?.getGlobalContext?.(),
          user: window.DD_LOGS?.getUser?.(),
        }

        const sdkVersion = (rum && rum.version) || (logs && logs.version)
        const sessionCookieName = sdkVersion && parseInt(sdkVersion, 10) >= 7 ? '_dd_s_v2' : '_dd_s'

        const cookieRawValue = document.cookie
          .split(';')
          .map(cookie => cookie.match(/(\\S*?)=(.*)/)?.slice(1) || [])
          .find(([name]) => name === sessionCookieName)
          ?.[1]

        const cookie = cookieRawValue && Object.fromEntries(
          cookieRawValue.split('&').map(value => value.split('='))
        )
        return { rum, logs, cookie, sessionCookieName }
      `
    )) as SdkInfos
  } catch (error) {
    logger.error('Error while getting SDK infos:', error)
    return {}
  }

  const sessionId = raw.cookie?.id
  return {
    ...raw,
    rumTrackingType:
      (raw.cookie?.rum ?? (sessionId && raw.rum?.config && computeRumTrackingType(sessionId, raw.rum.config))) ||
      undefined,
    logsTrackingType:
      (raw.cookie?.logs ?? (sessionId && raw.logs?.config && computeLogsTrackingType(sessionId, raw.logs.config))) ||
      undefined,
  }
}

function deepEqual(a: unknown, b: unknown) {
  // Quick and dirty but does the job. We might want to include a cleaner helper if our needs are
  // changing.
  return JSON.stringify(a) === JSON.stringify(b)
}
