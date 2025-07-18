const fs = require('fs')
const path = require('path')

const { compileFromFile } = require('json-schema-to-typescript')

const prettier = require('prettier')
const { printLog, runMain } = require('./lib/executionUtils')

const prettierConfigPath = path.join(__dirname, '../.prettierrc.yml')

runMain(async () => {
  await generateRumEventsFormatTypes(path.join(__dirname, '../rum-events-format/schemas'))
  await generateRemoteConfigTypes(path.join(__dirname, '../remote-config'))
})

async function generateRumEventsFormatTypes(schemasDirectoryPath) {
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

async function generateRemoteConfigTypes(schemasDirectoryPath) {
  await generateTypesFromSchema(
    path.join(__dirname, '../packages/rum-core/src/domain/configuration/remoteConfig.types.ts'),
    schemasDirectoryPath,
    'rum-sdk-config.json'
  )
}

async function generateTypesFromSchema(typesPath, schemasDirectoryPath, schema, { options = {} } = {}) {
  const schemaPath = path.join(schemasDirectoryPath, schema)
  const prettierConfig = await prettier.resolveConfig(prettierConfigPath)
  printLog(`Compiling ${schemaPath}...`)
  const compiledTypes = await compileFromFile(schemaPath, {
    cwd: schemasDirectoryPath,
    bannerComment: '/* eslint-disable */\n/**\n * DO NOT MODIFY IT BY HAND. Run `yarn json-schemas:sync` instead.\n*/',
    style: prettierConfig,
    ...options,
  })
  printLog(`Writing ${typesPath}...`)
  fs.writeFileSync(typesPath, compiledTypes)
  printLog('Generation done.')
}
