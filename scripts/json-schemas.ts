import * as fs from 'node:fs'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import type jsonSchemaToTypescriptModule from 'json-schema-to-typescript'
import { format, resolveConfig } from 'prettier'

import { printLog, runMain } from './lib/executionUtils.ts'
import { command } from './lib/command.ts'
import { RUM_EVENTS_FORMAT_DIR, RUM_EVENTS_FORMAT_SCHEMAS_DIR, SCHEMAS } from './lib/generatedSchemaTypes.ts'

const RUM_EVENTS_FORMAT_README_PATH = path.join(RUM_EVENTS_FORMAT_DIR, 'README.md')

// The packages needed to sync the schemas and generate types are installed from GitHub in this
// separate Yarn project, so installing the main project never fetches anything from GitHub.
const TOOLS_DIR = path.join(import.meta.dirname, '../node_modules/.cache/json-schemas')
const RUM_EVENTS_FORMAT_REPOSITORY = 'DataDog/rum-events-format'
// Fork of json-schema-to-typescript adding `readonly` support
// TODO use the npm package once a released version supports the `readOnly` keyword
const JSON2TYPE_REPOSITORY = 'bcaudan/json-schema-to-typescript'
const JSON2TYPE_DEPENDENCY = `${JSON2TYPE_REPOSITORY}#commit=406ce54242635f4a0181bd573a3cbc896707e4cc`
const prettierConfigPath = path.join(import.meta.dirname, '../.prettierrc.yml')

runMain(async () => {
  const {
    values: { update: branch, check: shouldCheck, build: shouldBuild, help },
  } = parseArgs({
    options: {
      update: { type: 'string' },
      check: { type: 'boolean' },
      build: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  })

  if (help) {
    printHelp()
    return
  }

  if (!branch && !shouldCheck && !shouldBuild) {
    printHelp()
    process.exit(1)
  }

  if (branch !== undefined) {
    update(branch)
  } else if (shouldCheck) {
    update(getCurrentCommit())
  }

  if (shouldBuild) {
    await build()
  }
})

function printHelp() {
  console.log(`
Usage: node scripts/json-schemas.ts [options]

Options:
  --update <branch|commit>  Copy the rum-events-format schemas from the latest commit on <branch> (or a specific full commit hash) to rum-events-format/schemas
  --check            Copy the rum-events-format schemas again from the commit they were copied from, to restore any local change
  --build            Install json-schema-to-typescript and regenerate TypeScript types from JSON schemas
  --help, -h         Show this help message

Examples:
  node scripts/json-schemas.ts --update master --build              # Full sync (alias: yarn json-schemas:sync)
  node scripts/json-schemas.ts --update <40-char-hash> --build       # Sync to a specific commit
  node scripts/json-schemas.ts --build                  # Regenerate types only (alias: yarn json-schemas:generate)
`)
}

function getCurrentCommit(): string {
  const match = /DataDog\/rum-events-format\/tree\/([0-9a-f]{40})/.exec(
    fs.readFileSync(RUM_EVENTS_FORMAT_README_PATH, 'utf8')
  )
  if (!match) {
    throw new Error(`Could not find the rum-events-format commit in ${RUM_EVENTS_FORMAT_README_PATH}`)
  }
  return match[1]
}

function update(branchOrCommit: string) {
  printLog(`Installing rum-events-format at ${branchOrCommit}...`)
  const commitHash = installTools(branchOrCommit)
  printLog(`Copying rum-events-format schemas from ${commitHash}...`)
  fs.rmSync(RUM_EVENTS_FORMAT_SCHEMAS_DIR, { recursive: true, force: true })
  fs.cpSync(path.join(TOOLS_DIR, 'node_modules/@datadog/rum-events-format/schemas'), RUM_EVENTS_FORMAT_SCHEMAS_DIR, {
    recursive: true,
  })
  fs.writeFileSync(
    RUM_EVENTS_FORMAT_README_PATH,
    `# RUM events format

This directory contains a copy of the JSON schemas of rum-events-format, so installing, building and
testing the SDK don't fetch anything from GitHub.

Source: <https://github.com/DataDog/rum-events-format/tree/${commitHash}>

Do not modify it by hand. Run \`yarn json-schemas:sync\` instead.
`
  )
  printLog('Updated rum-events-format/schemas')
}

/**
 * Install rum-events-format at the given branch or commit, and the json-schema-to-typescript fork, in
 * a Yarn project separate from the main one. Return the installed rum-events-format commit.
 */
function installTools(branchOrCommit: string): string {
  const ref = /^[0-9a-f]{40}$/.test(branchOrCommit) ? `commit=${branchOrCommit}` : `head=${branchOrCommit}`
  fs.mkdirSync(TOOLS_DIR, { recursive: true })
  fs.writeFileSync(
    path.join(TOOLS_DIR, 'package.json'),
    `${JSON.stringify(
      {
        name: 'json-schemas-tools',
        private: true,
        dependencies: {
          '@datadog/rum-events-format': `${RUM_EVENTS_FORMAT_REPOSITORY}#${ref}`,
          'json-schema-to-typescript': JSON2TYPE_DEPENDENCY,
          // Needed to build the fork
          typescript: '5.9.3',
        },
      },
      null,
      2
    )}\n`
  )
  fs.writeFileSync(
    path.join(TOOLS_DIR, '.yarnrc.yml'),
    `approvedGitRepositories:
  - 'https://github.com/${RUM_EVENTS_FORMAT_REPOSITORY}.git'
  - 'https://github.com/${JSON2TYPE_REPOSITORY}.git'
`
  )
  // A yarn.lock makes this directory a project of its own. Start from an empty one so a branch is
  // resolved to its latest commit. Pinned commits are still taken from the Yarn cache.
  fs.writeFileSync(path.join(TOOLS_DIR, 'yarn.lock'), '')
  command`yarn install --no-immutable`.withCurrentWorkingDirectory(TOOLS_DIR).run()

  const match = /rum-events-format\.git#commit=([0-9a-f]{40})/.exec(
    fs.readFileSync(path.join(TOOLS_DIR, 'yarn.lock'), 'utf8')
  )
  if (!match) {
    throw new Error(`Could not find the installed rum-events-format commit in ${TOOLS_DIR}/yarn.lock`)
  }
  return match[1]
}

/**
 * The fork is installed from its sources: build it the first time it is used.
 */
function importJsonSchemaToTypescript() {
  const packageDir = path.join(TOOLS_DIR, 'node_modules/json-schema-to-typescript')
  const entryPoint = path.join(packageDir, 'dist/src/index.js')
  if (!fs.existsSync(entryPoint)) {
    printLog('Building json-schema-to-typescript...')
    const tscPath = path.join(TOOLS_DIR, 'node_modules/typescript/bin/tsc')
    // Its type checking needs its dev dependencies, which are not installed. Its output doesn't.
    command`node ${tscPath} --declaration --noCheck --rootDir .`.withCurrentWorkingDirectory(packageDir).run()
  }
  return import(pathToFileURL(entryPoint).href) as Promise<typeof jsonSchemaToTypescriptModule>
}

async function build() {
  printLog('Installing json-schema-to-typescript...')
  installTools(getCurrentCommit())
  const { compileFromFile } = await importJsonSchemaToTypescript()

  printLog('Generating schema types...')
  const prettierConfig = await resolveConfig(prettierConfigPath)

  for (const { typesPath, schemaPath, options = {} } of SCHEMAS) {
    const absoluteTypesPath = path.resolve(import.meta.dirname, '..', typesPath)
    printLog(`Compiling ${schemaPath}...`)
    const compiledTypes = await compileFromFile(schemaPath, {
      cwd: path.dirname(schemaPath),
      bannerComment: '/**\n * DO NOT MODIFY IT BY HAND. Run `yarn json-schemas:sync` instead.\n*/',
      // Skip json-schema-to-typescript's internal prettier pass: it resolves an ambient
      // prettier that can differ between environments. Format with the repo's pinned prettier
      // below instead, so the output is deterministic and matches `prettier --check .`.
      format: false,
      ...options,
    })
    printLog(`Writing ${typesPath}...`)
    const formattedTypes = await format(compiledTypes, { ...prettierConfig, parser: 'typescript' })
    fs.writeFileSync(absoluteTypesPath, formattedTypes)
  }

  printLog('Done.')
}
