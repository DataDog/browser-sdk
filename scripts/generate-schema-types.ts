import * as fs from 'fs'
import * as path from 'path'
import { printLog, runMain } from './lib/executionUtils'

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
const { compileFromFile } = require('json-schema-to-typescript')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const prettier = require('prettier')

const prettierConfigPath = path.join(__dirname, '../.prettierrc.yml')

runMain(async () => {
  await generateRumEventsFormatTypes(path.join(__dirname, '../rum-events-format/schemas'))
  await generateRemoteConfigTypes(path.join(__dirname, '../remote-config'))
})

async function generateRumEventsFormatTypes(schemasDirectoryPath: string): Promise<void> {
  await generateTypesFromSchema(
    path.join(__dirname, '../packages/rum-core/src/rumEvent.types.ts'),
    schemasDirectoryPath,
    'rum-events-schema.json'
  )
  await generateTypesFromSchema(
    path.join(__dirname, '../packages/core/src/domain/telemetry/telemetryEvent.types.ts'),
    schemasDirectoryPath,
    'telemetry-events-schema.json'
  )
  await generateTypesFromSchema(
    path.join(__dirname, '../packages/rum/src/types/sessionReplay.ts'),
    schemasDirectoryPath,
    'session-replay-browser-schema.json',
    { options: { additionalProperties: false } }
  )
}

async function generateRemoteConfigTypes(schemasDirectoryPath: string): Promise<void> {
  await generateTypesFromSchema(
    path.join(__dirname, '../packages/rum-core/src/domain/configuration/remoteConfig.types.ts'),
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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const prettierConfig = await prettier.resolveConfig(prettierConfigPath)
  printLog(`Compiling ${schemaPath}...`)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const compiledTypes = (await compileFromFile(schemaPath, {
    cwd: schemasDirectoryPath,
    bannerComment: '/* eslint-disable */\n/**\n * DO NOT MODIFY IT BY HAND. Run `yarn json-schemas:sync` instead.\n*/',
    style: prettierConfig || {},
    ...options,
  })) as string
  printLog(`Writing ${typesPath}...`)
  fs.writeFileSync(typesPath, compiledTypes)
  printLog('Generation done.')
}
