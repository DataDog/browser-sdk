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
    account?: Context
  }
  logs?: {
    version?: string
    config?: LogsInitConfiguration
    globalContext?: Context
    user: Context
    account?: Context
  }
  cookie?: {
    id?: string
    created?: string
    expire?: string
    logs?: string
    rum?: string
    forcedReplay?: '1'
    anonymousId?: string
  }
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

        // SDK v7 renamed the session cookie from '_dd_s' to '_dd_s_v2'. Prefer the new
        // name and fall back to the legacy one so this works for both v6 and v7 apps.
        function findCookieValue(name) {
          return document.cookie
            .split(';')
            .map(c => c.match(/(\\S*?)=(.*)/)?.slice(1) || [])
            .find(([cookieName]) => cookieName === name)
            ?.[1]
        }
        const cookieRawValue = findCookieValue('_dd_s_v2') ?? findCookieValue('_dd_s')

        const cookieEntries = cookieRawValue
          ? cookieRawValue.split('&').map((value) => value.split('='))
          : null
        const cookie = cookieEntries && Object.fromEntries(
          cookieEntries.map(([key, val]) => (key === 'aid' ? ['anonymousId', val] : [key, val]))
        )
        const rum = window.DD_RUM && {
          version: window.DD_RUM?.version,
          config: serializeWithFunctions(window.DD_RUM?.getInitConfiguration?.()),
          internalContext: window.DD_RUM?.getInternalContext?.(),
          globalContext: window.DD_RUM?.getGlobalContext?.(),
          user: window.DD_RUM?.getUser?.(),
          account: window.DD_RUM?.getAccount?.(),
        }
        const logs = window.DD_LOGS && {
          version: window.DD_LOGS?.version,
          config: serializeWithFunctions(window.DD_LOGS?.getInitConfiguration?.()),
          globalContext: window.DD_LOGS?.getGlobalContext?.(),
          user: window.DD_LOGS?.getUser?.(),
          account: window.DD_LOGS?.getAccount?.(),
        }
        return { rum, logs, cookie }
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
