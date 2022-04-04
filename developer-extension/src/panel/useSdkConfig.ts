import { useEffect, useState } from 'react'

const REFRESH_CONFIGURATION_INTERVAL = 2000

export function useSdkConfig() {
  const [rumConfig, setRumConfig] = useState<object>()
  const [logsConfig, setLogsConfig] = useState<object>()

  useEffect(() => {
    function getInitConfigurations() {
      getInitConfiguration('rum').then(setRumConfig).catch(console.error)
      getInitConfiguration('logs').then(setLogsConfig).catch(console.error)
    }
    getInitConfigurations()
    const id = setInterval(getInitConfigurations, REFRESH_CONFIGURATION_INTERVAL)
    return () => clearInterval(id)
  }, [])

  return { rumConfig, logsConfig }
}

function getInitConfiguration(sdk: 'rum' | 'logs') {
  return new Promise<object>((resolve, reject) => {
    chrome.devtools.inspectedWindow.eval(
      `window.DD_${sdk.toUpperCase()}?.getInitConfiguration()`,
      function (config, isException) {
        if (isException) {
          reject(config)
        } else {
          resolve(config as object)
        }
      }
    )
  })
}
