import { useEffect, useState } from 'react'
import { DEV_LOGS_URL } from '../../common/packagesUrlConstants'

const REFRESH_DELAY = 2000
const CHECKING_STATUS_DELAY = 500

export const enum DevServerStatus {
  CHECKING,
  AVAILABLE,
  UNAVAILABLE,
}

export function useDevServerStatus() {
  const [status, setStatus] = useState<DevServerStatus>(DevServerStatus.CHECKING)

  useEffect(() => {
    const abortController = new AbortController()
    let checkingTimeoutId: number

    void refreshDevServerStatus(abortController.signal, (status) => {
      // We don't want to show the CHECKING state to quickly to avoid UI flashing. Delay the actual
      // `setStatus` a little bit.
      if (status === DevServerStatus.CHECKING) {
        checkingTimeoutId = setTimeout(() => setStatus(DevServerStatus.CHECKING), CHECKING_STATUS_DELAY)
      } else {
        clearTimeout(checkingTimeoutId)
        setStatus(status)
      }
    })

    return () => {
      clearTimeout(checkingTimeoutId)
      abortController.abort()
    }
  }, [])

  return status
}

async function refreshDevServerStatus(abortSignal: AbortSignal, callback: (status: DevServerStatus) => void) {
  if (abortSignal.aborted) {
    return
  }

  callback(DevServerStatus.CHECKING)

  const isAvailable = await isDevServerAvailable(abortSignal)

  if (abortSignal.aborted) {
    return
  }

  callback(isAvailable ? DevServerStatus.AVAILABLE : DevServerStatus.UNAVAILABLE)

  setTimeout(() => {
    void refreshDevServerStatus(abortSignal, callback)
  }, REFRESH_DELAY)
}

async function isDevServerAvailable(abortSignal: AbortSignal) {
  try {
    const response = await fetch(DEV_LOGS_URL, { method: 'HEAD', signal: abortSignal })
    return response.status === 200
  } catch {
    // The request can fail if nothing is listening on the URL port. In this case, consider the dev
    // server 'unavailable'.
    return false
  }
}
