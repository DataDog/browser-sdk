import { useLayoutEffect, useRef } from 'react'
import { startNextjsView } from '../nextjsPlugin'

export function useStartNextjsView(path: string | null, viewName: string) {
  const previousPath = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (path !== null && previousPath.current !== path) {
      previousPath.current = path
      startNextjsView(viewName)
    }
  }, [path, viewName])
}
