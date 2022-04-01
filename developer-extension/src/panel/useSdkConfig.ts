import { useEffect, useState } from 'react'

export function useSdkConfig() {
  const [rumConfig, setRumConfig] = useState<object>()
  const [logsConfig, setLogsConfig] = useState<object>()

  useEffect(() => {
    retry(getInitConfiguration('rum')).then(setRumConfig).catch(console.error)
    retry(getInitConfiguration('logs')).then(setLogsConfig).catch(console.error)
  }, [])

  return { rumConfig, logsConfig }
}

function getInitConfiguration(sdk: 'rum' | 'logs') {
  return () =>
    new Promise<object>((resolve, reject) => {
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

async function retry<T>(fn: () => Promise<T>, retries = 5, interval = 1000): Promise<T> {
  try {
    const val = await fn()
    return val
  } catch (error) {
    if (retries) {
      await new Promise((r) => setTimeout(r, interval))
      return retry(fn, retries - 1, interval)
    }
    throw new Error('Max retries reached')
  }
}
