import { ConsoleApiName, globalConsole, instrumentMethod, sanitize } from '@datadog/browser-core'
import { EVENT, type ConsoleEvent } from '../event'
import type { TransportManager } from '../transportManager'

type Stoppable = { stop: () => void }

export function trackConsoleMethods(transportManager: TransportManager) {
  function onMessage(method: ConsoleApiName, args: unknown[]): void {
    const data: ConsoleEvent = {
      type: EVENT.CONSOLE,
      method,
      args: args.map((arg) => sanitize(arg)),
    }

    transportManager.send(data)
  }

  const subscriptions: Stoppable[] = Object.values(ConsoleApiName).map((method) =>
    instrumentMethod(globalConsole, method, ({ parameters }) => onMessage(method, parameters))
  )

  return () => subscriptions.forEach((subscription) => subscription.stop())
}
