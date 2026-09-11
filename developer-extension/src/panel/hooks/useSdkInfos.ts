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
          const stringified = JSON.stringify(obj, function(key, value) {
            if (typeof value === 'function') {
              return {
                __type: 'function',
                __name: value.name || '(anonymous)',
                __source: value.toString()
              }
            }
            return value
          })
          if (stringified === undefined) {
            return stringified
          }
          return JSON.parse(stringified)
        }

        // SDK v7 renamed the session cookie from '_dd_s' to '_dd_s_v2'. The SDK's own
        // version string can't be used to tell which name is active: local dev builds
        // always report 'dev' regardless of which major is checked out, so a v6 dev
        // build and a v7 dev build look identical. Instead, read both cookie names and
        // keep whichever holds the more recently created valid session, since only an
        // actively running SDK instance writes fresh data under its own cookie name.
        //
        // When multiple cookies share the same name (e.g. after changing
        // trackSessionAcrossSubdomains or usePartitionedCrossSiteSessionCookie), the SDK
        // picks the one whose 'c' marker matches its current cookie options. We replicate
        // that formula here: c = ((domainCount << 1) | crossSite).toString(16).
        // SESSION_COOKIE_VERSION is omitted because it is currently 0 and contributes
        // nothing to the value.
        function findMatchingCookieValue(name, config) {
          const domain = config?.domain
          const crossSite = config?.usePartitionedCrossSiteSessionCookie ? 1 : 0
          const domainCount = domain ? domain.split('.').length - 1 : 0
          const expectedC = ((domainCount << 1) | crossSite).toString(16)

          const matches = document.cookie
            .split(';')
            .map(c => c.match(/(\\S*?)=(.*)/)?.slice(1) || [])
            .filter(([cookieName]) => cookieName === name)
            .map(([, val]) => val)

          for (const val of [...matches].reverse()) {
            const entries = Object.fromEntries(val.split('&').map(v => v.split('=')))
            if (entries.c === expectedC) return val
          }

          return matches[0]
        }
        function parseSessionCookie(rawValue) {
          if (!rawValue) {
            return null
          }
          const entries = Object.fromEntries(rawValue.split('&').map((v) => v.split('=')))
          // No 'id' means either an expired tombstone (isExpired=1) or malformed data.
          return entries.id ? entries : null
        }

        const sdkConfig = window.DD_RUM?.getInitConfiguration?.() ?? window.DD_LOGS?.getInitConfiguration?.()
        const v2RawValue = findMatchingCookieValue('_dd_s_v2', sdkConfig)
        const v6RawValue = findMatchingCookieValue('_dd_s', sdkConfig)
        const v2Session = parseSessionCookie(v2RawValue)
        const v6Session = parseSessionCookie(v6RawValue)

        const cookieRawValue =
          v2Session && v6Session
            ? (Number(v2Session.created) >= Number(v6Session.created) ? v2RawValue : v6RawValue)
            : (v2RawValue ?? v6RawValue)

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
