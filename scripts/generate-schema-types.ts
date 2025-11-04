import * as fs from 'node:fs'
import * as path from 'node:path'

import { compileFromFile } from 'json-schema-to-typescript'
import { resolveConfig } from 'prettier'
import { printLog, runMain } from './lib/executionUtils.ts'

const prettierConfigPath = path.join(import.meta.dirname, '../.prettierrc.yml')

runMain(async () => {
  await generateRumEventsFormatTypes(path.join(import.meta.dirname, '../rum-events-format/schemas'))
  await generateRemoteConfigurationTypes(path.join(import.meta.dirname, '../remote-configuration'))
})

async function generateRumEventsFormatTypes(schemasDirectoryPath: string): Promise<void> {
  await generateTypesFromSchema(
    path.join(import.meta.dirname, '../packages/rum-core/src/rumEvent.types.ts'),
    schemasDirectoryPath,
    'rum-events-browser-schema.json'
  )
  await generateTypesFromSchema(
    path.join(import.meta.dirname, '../packages/core/src/domain/telemetry/telemetryEvent.types.ts'),
    schemasDirectoryPath,
    'telemetry-events-schema.json'
  )
  await generateTypesFromSchema(
    path.join(import.meta.dirname, '../packages/rum/src/types/sessionReplay.ts'),
    schemasDirectoryPath,
    'session-replay-browser-schema.json',
    { options: { additionalProperties: false } }
  )
}

async function generateRemoteConfigurationTypes(schemasDirectoryPath: string): Promise<void> {
  await generateTypesFromSchema(
    path.join(import.meta.dirname, '../packages/rum-core/src/domain/configuration/remoteConfiguration.types.ts'),
    schemasDirectoryPath,
    'rum-sdk-config.json'
  )
}

interface GenerateOptions {
  options?: any
}

async function generateTypesFromSchema(
  typesPath: string,
  schemasDirectoryPath: string,
  schema: string,
  { options = {} }: GenerateOptions = {}
): Promise<void> {
  const schemaPath = path.join(schemasDirectoryPath, schema)

  const prettierConfig = await resolveConfig(prettierConfigPath)
  printLog(`Compiling ${schemaPath}...`)
  const compiledTypes = await compileFromFile(schemaPath, {
    cwd: schemasDirectoryPath,
    bannerComment: '/* eslint-disable */\n/**\n * DO NOT MODIFY IT BY HAND. Run `yarn json-schemas:sync` instead.\n*/',
    style: prettierConfig || {},
    ...options,
  })
  printLog(`Writing ${typesPath}...`)
  fs.writeFileSync(typesPath, compiledTypes)
  printLog('Generation done.')
}
