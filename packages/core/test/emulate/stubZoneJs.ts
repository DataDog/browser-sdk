import type { BrowserWindowWithZoneJs } from '../../src/tools'

export function stubZoneJs() {
  const browserWindow = window as BrowserWindowWithZoneJs
  const restorers: Array<() => void> = []

  function getSymbol(name: string) {
    return `__zone_symbol__${name}`
  }

  browserWindow.Zone = { __symbol__: getSymbol }

  return {
    restore: () => {
      delete browserWindow.Zone
      restorers.forEach((restorer) => restorer())
    },
    getSymbol,
    replaceProperty<Target, Name extends keyof Target & string>(target: Target, name: Name, replacement: Target[Name]) {
      const original = target[name]
      target[name] = replacement
      ;(target as any)[getSymbol(name)] = original
      restorers.push(() => {
        delete (target as any)[getSymbol(name)]
        target[name] = original
      })
    },
  }
}
