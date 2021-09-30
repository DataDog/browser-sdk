const fs = require('fs')
const path = require('path')
const { compileFromFile } = require('json-schema-to-typescript')
const prettier = require('prettier')
const { printLog, logAndExit } = require('./utils')

const workingDirectory = path.join(__dirname, '../rum-events-format')
const schemaPath = path.join(workingDirectory, 'rum-events-format.json')
const compiledTypesPath = path.join(__dirname, '../packages/rum-core/src/rumEvent.types.ts')
const prettierConfigPath = path.join(__dirname, '../.prettierrc.yml')

async function main() {
  const prettierConfig = await prettier.resolveConfig(prettierConfigPath)
  printLog(`Compiling ${schemaPath}...`)
  const compiledTypes = await compileFromFile(schemaPath, {
    cwd: workingDirectory,
    bannerComment:
      '/* eslint-disable */\n/**\n * DO NOT MODIFY IT BY HAND. Run `yarn rum-events-format:sync` instead.\n*/',
    style: prettierConfig,
  })
  printLog(`Writing ${compiledTypesPath}...`)
  fs.writeFileSync(compiledTypesPath, compiledTypes)
  printLog('Generation done.')
}

main().catch(logAndExit)
