const fs = require('fs')
const path = require('path')
const { compileFromFile } = require('json-schema-to-typescript')
const prettier = require('prettier')

const workingDirectory = path.join(__dirname, '../rum-events-format')
const schemaPath = path.join(workingDirectory, 'rum-events-format.json')
const compiledTypesPath = path.join(__dirname, '../packages/rum-core/src/rumEvent.types.ts')
const prettierConfigPath = path.join(__dirname, '../.prettierrc.yml')

async function main() {
  const prettierConfig = await prettier.resolveConfig(prettierConfigPath)
  console.log(`compiling ${schemaPath}`)
  const compiledTypes = await compileFromFile(schemaPath, {
    cwd: workingDirectory,
    bannerComment:
      '/* eslint-disable */\n/**\n * DO NOT MODIFY IT BY HAND. Run `yarn rum-events-format:sync` instead.\n*/',
    style: prettierConfig,
  })
  console.log(`writing ${compiledTypesPath}`)
  fs.writeFileSync(compiledTypesPath, compiledTypes)
  console.log('done')
}

main().catch((e) => {
  console.error('\nStacktrace:\n', e)
  process.exit(1)
})
