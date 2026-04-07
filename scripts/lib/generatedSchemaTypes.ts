import type { Options } from 'json-schema-to-typescript'

export interface SchemaConfig {
  typesPath: string
  schemaPath: string
  options?: Partial<Options>
}

export const SCHEMAS: SchemaConfig[] = [
  {
    typesPath: 'packages/rum-core/src/domain/configuration/remoteConfiguration.types.ts',
    schemaPath: 'remote-configuration/rum-sdk-config.json',
  },
]
