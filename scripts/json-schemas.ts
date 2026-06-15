import * as fs from 'node:fs'
import * as path from 'node:path'
import { parseArgs } from 'node:util'

import type jsonSchemaToTypescriptModule from 'json-schema-to-typescript'
import { resolveConfig } from 'prettier'

import { printLog, runMain, fetchHandlingError } from './lib/executionUtils.ts'
import { command } from './lib/command.ts'
import { modifyFile } from './lib/filesUtils.ts'
import { SCHEMAS } from './lib/generatedSchemaTypes.ts'

const PACKAGE_JSON_PATH = path.join(import.meta.dirname, '../package.json')
const JSON2TYPE_PATH = path.join(import.meta.dirname, '../node_modules/json-schema-to-typescript')
const prettierConfigPath = path.join(import.meta.dirname, '../.prettierrc.yml')

runMain(async () => {
  const {
    values: { update: branch, build: shouldBuild, help },
  } = parseArgs({
    options: {
      update: { type: 'string' },
      build: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  })

  if (help) {
    printHelp()
    return
  }

  if (!branch && !shouldBuild) {
    printHelp()
    process.exit(1)
  }

  if (branch !== undefined) {
    await update(branch)
  }

  if (shouldBuild) {
    await build()
  }
})

function printHelp() {
  console.log(`
Usage: node scripts/json-schemas.ts [options]

Options:
  --update <branch|commit>  Update @datadog/rum-events-format to the latest commit on <branch> (or a specific full commit hash) and run yarn install
  --build            Build json-schema-to-typescript and regenerate TypeScript types from JSON schemas
  --help, -h         Show this help message

Examples:
  node scripts/json-schemas.ts --update master --build              # Full sync (alias: yarn json-schemas:sync)
  node scripts/json-schemas.ts --update <40-char-hash> --build       # Sync to a specific commit
  node scripts/json-schemas.ts --build                  # Regenerate types only (alias: yarn json-schemas:generate)
`)
}

async function update(branchOrCommit: string) {
  let commitHash: string
  if (/^[0-9a-f]{40}$/.test(branchOrCommit)) {
    commitHash = branchOrCommit
    printLog(`Using provided commit hash: ${commitHash}`)
  } else {
    printLog(`Resolving latest commit on ${branchOrCommit}...`)
    const response = await fetchHandlingError(
      `https://api.github.com/repos/DataDog/rum-events-format/branches/${branchOrCommit}`
    )
    const {
      commit: { sha },
    } = (await response.json()) as { commit: { sha: string } }
    if (!sha) {
      throw new Error(`Could not resolve branch ${branchOrCommit}`)
    }
    commitHash = sha
    printLog(`Latest commit: ${commitHash}`)
  }

  await modifyFile(PACKAGE_JSON_PATH, (content) =>
    content.replace(
      /"@datadog\/rum-events-format": "DataDog\/rum-events-format#[^"]+"/,
      `"@datadog/rum-events-format": "DataDog/rum-events-format#commit=${commitHash}"`
    )
  )
  printLog('Updated @datadog/rum-events-format in package.json')

  printLog('Running yarn install...')
  command`yarn install`.run()
}

async function build() {
  const { compileFromFile } = await getJsonSchemaToTypescript()

  printLog('Generating schema types...')
  const prettierConfig = await resolveConfig(prettierConfigPath)

  for (const { typesPath, schemaPath, options = {} } of SCHEMAS) {
    const absoluteTypesPath = path.resolve(import.meta.dirname, '..', typesPath)
    printLog(`Compiling ${schemaPath}...`)
    const compiledTypes = await compileFromFile(schemaPath, {
      cwd: path.dirname(schemaPath),
      bannerComment: '/**\n * DO NOT MODIFY IT BY HAND. Run `yarn json-schemas:sync` instead.\n*/',
      style: prettierConfig || {},
      ...options,
    })
    printLog(`Writing ${typesPath}...`)
    fs.writeFileSync(absoluteTypesPath, compiledTypes)
  }

  printLog('Done.')
}

let jsonSchemaToTypescriptCache: Promise<typeof jsonSchemaToTypescriptModule> | undefined

function getJsonSchemaToTypescript() {
  if (!jsonSchemaToTypescriptCache) {
    jsonSchemaToTypescriptCache = import('json-schema-to-typescript').catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ERR_MODULE_NOT_FOUND') {
        throw error
      }
      buildJsonSchemaToTypescript()
      return import('json-schema-to-typescript')
    })
  }
  return jsonSchemaToTypescriptCache

  // needed because using fork instead of the npm package
  // TODO remove me when json-schema-to-typescript natively supports readOnly
  function buildJsonSchemaToTypescript() {
    printLog('Building json-schema-to-typescript...')
    // due to installation on node_modules, some of these steps can fail
    // built version still behaves correctly though
    try {
      command`npm i`.withCurrentWorkingDirectory(JSON2TYPE_PATH).run()
      command`npm run clean`.withCurrentWorkingDirectory(JSON2TYPE_PATH).run()
      // With yarn 3+, the 'test/' folder is not present, so all built files are put directly in the
      // 'dist/' folder instead of 'dist/src/'. Using an explicit '--rootDir' fixes this issue.
      command`npm exec -- tsc --declaration --rootDir .`.withCurrentWorkingDirectory(JSON2TYPE_PATH).run()
    } catch {
      // ignore
    }
  }
}
