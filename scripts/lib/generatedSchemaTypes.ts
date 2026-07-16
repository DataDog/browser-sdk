import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Options } from 'json-schema-to-typescript'

const rootDir = path.resolve(import.meta.dirname, '../..')
const schemasDir = path.join(
  path.dirname(fileURLToPath(import.meta.resolve('@datadog/rum-events-format/package.json'))),
  'schemas'
)

export interface SchemaConfig {
  typesPath: string
  schemaPath: string
  options?: Partial<Options>
}

export const SCHEMAS: SchemaConfig[] = [
  {
    typesPath: 'packages/browser-rum-core/src/rumEvent.types.ts',
    schemaPath: path.join(schemasDir, 'rum-events-browser-schema.json'),
  },
  {
    typesPath: 'packages/browser-core/src/domain/telemetry/telemetryEvent.types.ts',
    schemaPath: path.join(schemasDir, 'telemetry-events-schema.json'),
  },
  {
    typesPath: 'packages/browser-rum/src/types/sessionReplay.ts',
    schemaPath: path.join(schemasDir, 'session-replay-browser-schema.json'),
    options: { additionalProperties: false },
  },
  {
    typesPath: 'packages/browser-rum/src/types/profiling.ts',
    schemaPath: path.join(schemasDir, 'profiling-browser-schema.json'),
    options: { additionalProperties: false },
  },
  {
    typesPath: 'packages/browser-core/src/domain/remoteConfiguration/remoteConfiguration.types.ts',
    schemaPath: path.join(rootDir, 'remote-configuration/rum-sdk-config.json'),
  },
]
