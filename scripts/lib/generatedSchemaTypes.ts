import type { Options } from 'json-schema-to-typescript'

export interface SchemaConfig {
  typesPath: string
  schemaPath: string
  options?: Partial<Options>
}

export const SCHEMAS: SchemaConfig[] = [
  {
    typesPath: 'packages/rum-core/src/rumEvent.types.ts',
    schemaPath: 'rum-events-format/schemas/rum-events-browser-schema.json',
  },
  {
    typesPath: 'packages/core/src/domain/telemetry/telemetryEvent.types.ts',
    schemaPath: 'rum-events-format/schemas/telemetry-events-schema.json',
  },
  {
    typesPath: 'packages/rum/src/types/sessionReplay.ts',
    schemaPath: 'rum-events-format/schemas/session-replay-browser-schema.json',
    options: { additionalProperties: false },
  },
  {
    typesPath: 'packages/rum/src/types/profiling.ts',
    schemaPath: 'rum-events-format/schemas/profiling-browser-schema.json',
    options: { additionalProperties: false },
  },
  {
    typesPath: 'packages/rum-core/src/domain/configuration/remoteConfiguration.types.ts',
    schemaPath: 'remote-configuration/rum-sdk-config.json',
  },
]
