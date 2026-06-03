import type { HookNames } from '../src/tools/abstractHooks'
import { abstractHooks } from '../src/tools/abstractHooks'

export type Hooks = ReturnType<typeof createHooks>

export const createHooks = abstractHooks<{
  [HookNames.Assemble]: (...args: any[]) => any
  [HookNames.AssembleTelemetry]: (...args: any[]) => any
}>
