import * as fs from 'node:fs'
import * as path from 'node:path'

import { compileFromFile } from 'json-schema-to-typescript'
import { resolveConfig } from 'prettier'
import { printLog, runMain } from './lib/executionUtils.ts'
import { SCHEMAS } from './lib/generatedSchemaTypes.ts'

const prettierConfigPath = path.join(import.meta.dirname, '../.prettierrc.yml')

runMain(async () => {
  const prettierConfig = await resolveConfig(prettierConfigPath)

  for (const { typesPath, schemaPath, options = {} } of SCHEMAS) {
    const absoluteSchemaPath = path.join(import.meta.dirname, '..', schemaPath)
    const absoluteTypesPath = path.join(import.meta.dirname, '..', typesPath)

    printLog(`Compiling ${schemaPath}...`)

    const compiledTypes = await compileFromFile(absoluteSchemaPath, {
      cwd: path.dirname(absoluteSchemaPath),
      bannerComment: '/**\n * DO NOT MODIFY IT BY HAND. Run `yarn json-schemas:sync` instead.\n*/',
      style: prettierConfig || {},
      ...options,
    })
    printLog(`Writing ${absoluteTypesPath}...`)
    fs.writeFileSync(absoluteTypesPath, compiledTypes)
    printLog('Generation done.')
  }
})
