import type { Configuration, Extension } from '../configuration'
import type { Pipeline } from '../pipeline/pipeline'
import type { Session } from '../session/session'

interface ModuleTransport {
  route(eventType: string, trackType: string): void
}

interface ModuleContext {
  config: Configuration & Record<string, unknown>
  pipeline: Pipeline<Record<string, unknown>>
  session: Session
  transport: ModuleTransport
}

interface Module<TKey extends string = string, TInit = unknown, TConfig = unknown, TDerived = object> {
  name: TKey
  extension: Extension<TKey, TInit, TConfig, TDerived>
  init(context: ModuleContext): Record<string, unknown>
}

export type { Module, ModuleContext, ModuleTransport }
