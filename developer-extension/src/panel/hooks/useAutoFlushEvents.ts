import { useEffect } from 'react'
import { flushEvents } from '../flushEvents'

const FLUSH_EVENTS_INTERVAL = 5000

export function useAutoFlushEvents(enabled: boolean) {
  useEffect(() => {
    if (enabled) {
      flushEvents()
      const id = setInterval(flushEvents, FLUSH_EVENTS_INTERVAL)
      return () => clearInterval(id)
    }
  }, [enabled])
}
