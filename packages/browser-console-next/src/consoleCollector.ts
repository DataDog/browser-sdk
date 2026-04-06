import type { Pipeline } from '@datadog/core-next'
import type { ConsoleResource } from '@datadog/core-next'

type ConsoleApi = 'log' | 'debug' | 'info' | 'warn' | 'error'

const CONSOLE_APIS: ConsoleApi[] = ['log', 'debug', 'info', 'warn', 'error']

function startConsoleCollection(pipeline: Pipeline<Record<string, unknown>>): () => void {
  const originalMethods = new Map<ConsoleApi, Function>()

  for (const api of CONSOLE_APIS) {
    originalMethods.set(api, console[api])

    console[api] = (...args: unknown[]) => {
      // Call the original first
      originalMethods.get(api)!.apply(console, args)

      // Build message from args
      const message = args.map((arg) => (typeof arg === 'string' ? arg : String(arg))).join(' ')

      // Extract Error if first arg is an Error
      const error = args[0] instanceof Error ? args[0] : undefined
      const stack = error?.stack

      const resource: ConsoleResource = { api, message, stack, error }
      pipeline.publish('resource:console', resource)
    }
  }

  // Return stop function that restores originals
  return () => {
    for (const [api, original] of originalMethods) {
      console[api] = original as any
    }
  }
}

export { startConsoleCollection }
export type { ConsoleApi }
