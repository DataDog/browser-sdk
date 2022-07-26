const fs = require('fs')
const path = require('path')
const { compileFromFile } = require('json-schema-to-typescript')
const prettier = require('prettier')
const { printLog, logAndExit } = require('./utils')

const schemasDirectoryPath = path.join(__dirname, '../rum-events-format/schemas')
const prettierConfigPath = path.join(__dirname, '../.prettierrc.yml')

async function main() {
  await generateTypesFromSchema(
    path.join(__dirname, '../packages/rum-core/src/rumEvent.types.ts'),
    'rum-events-schema.json'
  )
  await generateTypesFromSchema(
    path.join(__dirname, '../packages/core/src/domain/telemetry/telemetryEvent.types.ts'),
    'telemetry-events-schema.json'
  )
  await generateTypesFromSchema(
    path.join(__dirname, '../packages/rum/src/types/sessionReplay.ts'),
    'session-replay-browser-schema.json',
    { options: { additionalProperties: false } }
  )
}

async function generateTypesFromSchema(typesPath, schema, { options = {} } = {}) {
  const schemaPath = path.join(schemasDirectoryPath, schema)
  const prettierConfig = await prettier.resolveConfig(prettierConfigPath)
  printLog(`Compiling ${schemaPath}...`)
  const compiledTypes = await compileFromFile(schemaPath, {
    cwd: schemasDirectoryPath,
    bannerComment:
      '/* eslint-disable */\n/**\n * DO NOT MODIFY IT BY HAND. Run `yarn rum-events-format:sync` instead.\n*/',
    style: prettierConfig,
    ...options,
  })
  printLog(`Writing ${typesPath}...`)
  fs.writeFileSync(typesPath, compiledTypes)
  printLog('Generation done.')
}

main().catch(logAndExit)
