import { useEffect } from 'react'

let autoFlushIntervalId: number | undefined

export const usePolling = (callback: () => void, condition: boolean) => {
  useEffect(callback, [])
  useEffect(() => {
    if (condition && !autoFlushIntervalId) {
      autoFlushIntervalId = setInterval(callback, 5000)
    }
    if (!condition && autoFlushIntervalId) {
      clearInterval(autoFlushIntervalId)
      autoFlushIntervalId = undefined
    }
  }, [condition])
}
