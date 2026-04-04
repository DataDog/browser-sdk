import type { Configuration, Extension } from '../configuration'
import type { Pipeline } from '../pipeline/pipeline'
import type { Session } from '../session/session'

interface ModuleContext {
  config: Configuration & Record<string, unknown>
  pipeline: Pipeline<Record<string, unknown>>
  session: Session
}

interface Module<TKey extends string = string, TInit = unknown, TConfig = unknown, TDerived = object> {
  name: TKey
  extension: Extension<TKey, TInit, TConfig, TDerived>
  init(context: ModuleContext): Record<string, unknown>
}

export type { Module, ModuleContext }
