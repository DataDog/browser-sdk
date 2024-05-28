import { useEffect } from 'react'
import { setDebugMode } from '../setDebugMode'

export function useDebugMode(enabled: boolean) {
  useEffect(() => {
    setDebugMode(enabled)
  }, [enabled])
}
