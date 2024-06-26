import type { BrowserWindowWithZoneJs } from '../../src/tools/getZoneJsOriginalValue'

export type MockZoneJs = ReturnType<typeof mockZoneJs>

export function mockZoneJs() {
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
