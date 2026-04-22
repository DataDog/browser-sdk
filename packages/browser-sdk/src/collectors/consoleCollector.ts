import type { Pipeline, ConsoleResource } from '@datadog/core-next'
import { flattenCauses, extractFingerprint } from '@datadog/core-next'

type ConsoleApi = 'log' | 'debug' | 'info' | 'warn' | 'error'

const CONSOLE_APIS: ConsoleApi[] = ['log', 'debug', 'info', 'warn', 'error']

function startConsoleCollection(pipeline: Pipeline<Record<string, unknown>>): () => void {
  const originalMethods = new Map<ConsoleApi, Function>()

  for (const api of CONSOLE_APIS) {
    originalMethods.set(api, console[api])

    console[api] = (...args: unknown[]) => {
      originalMethods.get(api)!.apply(console, args)

      const message = args.map((arg) => (typeof arg === 'string' ? arg : String(arg))).join(' ')
      const error = args[0] instanceof Error ? args[0] : undefined
      const fingerprint = extractFingerprint(error)
      const causes = error ? flattenCauses(error) : undefined

      const resource: ConsoleResource = { api, message, error, fingerprint, causes }
      pipeline.publish('resource:console', resource)
    }
  }

  return () => {
    for (const [api, original] of originalMethods) {
      console[api] = original as any
    }
  }
}

export { startConsoleCollection }
export type { ConsoleApi }
