import { useEffect, useState } from 'react'
import { evalInWindow } from '../evalInWindow'

const REFRESH_INFOS_INTERVAL = 2000

interface SdkInfos {
  rum?: {
    version?: string
    config?: object & { site?: string }
    internalContext?: object & { session: { id: string } }
    globalContext?: object
  }
  logs?: {
    version?: string
    config?: object & { site?: string }
    globalContext?: object
  }
  cookie?: {
    id: string
    created: string
    expire: string
    logs: string
    rum: string
  }
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
  try {
    return (await evalInWindow(
      `
        const cookieRawValue = document.cookie
          .split(';')
          .map(cookie => cookie.match(/(\\S*?)=(.*)/).slice(1))
          .find(([name, _]) => name === '_dd_s')
          ?.[1]

        const cookie = cookieRawValue && Object.fromEntries(
          cookieRawValue.split('&').map(value => value.split('='))
        )
        const rum = window.DD_RUM && {
          version: window.DD_RUM?.version,
          config: window.DD_RUM?.getInitConfiguration?.(),
          internalContext: window.DD_RUM?.getInternalContext?.(),
          globalContext: window.DD_RUM?.getRumGlobalContext?.(),
        }
        const logs = window.DD_RUM && {
          version: window.DD_LOGS?.version,
          config: window.DD_LOGS?.getInitConfiguration?.(),
          globalContext: window.DD_LOGS?.getLoggerGlobalContext?.(),
        }
        return { rum, logs, cookie }
      `
    )) as SdkInfos
  } catch (error) {
    console.error('Error while getting SDK infos:', error)
  }
  return {}
}

function deepEqual(a: unknown, b: unknown) {
  // Quick and dirty but does the job. We might want to include a cleaner helper if our needs are
  // changing.
  return JSON.stringify(a) === JSON.stringify(b)
}
