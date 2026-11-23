import * as path from 'node:path'
import type { Options } from 'json-schema-to-typescript'

const rootDir = path.resolve(import.meta.dirname, '../..')
export const RUM_EVENTS_FORMAT_DIR = path.join(rootDir, 'rum-events-format')
export const RUM_EVENTS_FORMAT_SCHEMAS_DIR = path.join(RUM_EVENTS_FORMAT_DIR, 'schemas')

export interface SchemaConfig {
  typesPath: string
  schemaPath: string
  options?: Partial<Options>
}

export const SCHEMAS: SchemaConfig[] = [
  {
    typesPath: 'packages/browser-rum-core/src/rumEvent.types.ts',
    schemaPath: path.join(RUM_EVENTS_FORMAT_SCHEMAS_DIR, 'rum-events-browser-schema.json'),
  },
  {
    typesPath: 'packages/browser-core/src/domain/telemetry/telemetryEvent.types.ts',
    schemaPath: path.join(RUM_EVENTS_FORMAT_SCHEMAS_DIR, 'telemetry-events-schema.json'),
  },
  {
    typesPath: 'packages/browser-rum/src/types/sessionReplay.ts',
    schemaPath: path.join(RUM_EVENTS_FORMAT_SCHEMAS_DIR, 'session-replay-browser-schema.json'),
    options: { additionalProperties: false },
  },
  {
    typesPath: 'packages/browser-rum/src/types/profiling.ts',
    schemaPath: path.join(RUM_EVENTS_FORMAT_SCHEMAS_DIR, 'profiling-browser-schema.json'),
    options: { additionalProperties: false },
  },
  {
    typesPath: 'packages/browser-rum-core/src/domain/configuration/remoteConfiguration.types.ts',
    schemaPath: path.join(rootDir, 'remote-configuration/rum-sdk-config.json'),
  },
]
