import { useEffect, useState } from 'react'
import { evalInWindow } from './evalInWindow'

const REFRESH_CONFIGURATION_INTERVAL = 2000

export function useSdkConfig() {
  const [rumConfig, setRumConfig] = useState<object>()
  const [logsConfig, setLogsConfig] = useState<object>()

  useEffect(() => {
    function getInitConfigurations() {
      void getInitConfiguration('rum').then(setRumConfig)
      void getInitConfiguration('logs').then(setLogsConfig)
    }
    getInitConfigurations()
    const id = setInterval(getInitConfigurations, REFRESH_CONFIGURATION_INTERVAL)
    return () => clearInterval(id)
  }, [])

  return { rumConfig, logsConfig }
}

async function getInitConfiguration(sdk: 'rum' | 'logs'): Promise<object | undefined> {
  let result: object | undefined
  try {
    result = (await evalInWindow(
      `
        return window.DD_${sdk.toUpperCase()}?.getInitConfiguration()
      `
    )) as object | undefined
  } catch (error) {
    console.error(`Error while getting ${sdk} configuration:`, error)
  }
  return result
}
