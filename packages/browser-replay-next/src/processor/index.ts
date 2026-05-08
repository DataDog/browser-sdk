import type { Module, ModuleContext } from '@datadog/core-next'
import { replayExtension } from '../domain/configuration'
import type { ReplayConfig } from '../domain/configuration'

interface ReplayPublicApi extends Record<string, unknown> {
  startSessionReplayRecording(options?: { force?: boolean }): void
  stopSessionReplayRecording(): void
}

const replayProcessor: Module = {
  name: 'replay',
  extension: replayExtension,
  init(_context: ModuleContext): ReplayPublicApi {
    // TODO: implement recording, segment collection, pipeline wiring
    return {
      startSessionReplayRecording(_options?: { force?: boolean }) {},
      stopSessionReplayRecording() {},
    }
  },
}

export { replayProcessor }
export type { ReplayPublicApi }
