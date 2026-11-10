import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import type jsonSchemaToTypescriptModule from 'json-schema-to-typescript'
import { format, resolveConfig } from 'prettier'

import { printLog, printWarning, runMain, fetchHandlingError } from './lib/executionUtils.ts'
import { command } from './lib/command.ts'
import { RUM_EVENTS_FORMAT_DIR, RUM_EVENTS_FORMAT_SCHEMAS_DIR, SCHEMAS } from './lib/generatedSchemaTypes.ts'

const RUM_EVENTS_FORMAT_README_PATH = path.join(RUM_EVENTS_FORMAT_DIR, 'README.md')

// Fork of json-schema-to-typescript adding `readonly` support. It is only needed to generate types,
// so it is downloaded and built on demand instead of being installed with the other dependencies.
// TODO use the npm package once a released version supports the `readOnly` keyword
const JSON2TYPE_REPOSITORY = 'bcaudan/json-schema-to-typescript'
const JSON2TYPE_COMMIT = '406ce54242635f4a0181bd573a3cbc896707e4cc'
const JSON2TYPE_PATH = path.join(
  import.meta.dirname,
  '../node_modules/.cache/json-schema-to-typescript',
  JSON2TYPE_COMMIT
)
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
    await update(await resolveCommit(branch))
  } else if (shouldCheck) {
    await update(getCurrentCommit())
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
  --build            Build json-schema-to-typescript and regenerate TypeScript types from JSON schemas
  --help, -h         Show this help message

Examples:
  node scripts/json-schemas.ts --update master --build              # Full sync (alias: yarn json-schemas:sync)
  node scripts/json-schemas.ts --update <40-char-hash> --build       # Sync to a specific commit
  node scripts/json-schemas.ts --build                  # Regenerate types only (alias: yarn json-schemas:generate)
`)
}

async function resolveCommit(branchOrCommit: string): Promise<string> {
  let commitHash: string
  if (/^[0-9a-f]{40}$/.test(branchOrCommit)) {
    commitHash = branchOrCommit
    printLog(`Using provided commit hash: ${commitHash}`)
  } else {
    printLog(`Resolving latest commit on ${branchOrCommit}...`)
    // Unauthenticated GitHub API requests are limited to 60/hour per IP, which is easily exhausted
    // behind a shared NAT. Authenticate with the user's `gh` CLI token to get the 5000/hour limit.
    let token = ''
    try {
      token = command`gh auth token`.run().trim()
    } catch {
      printWarning(
        'Could not get a token from `gh auth token`; issuing unauthenticated GitHub requests (limited to 60/hour per IP).'
      )
    }
    const response = await fetchHandlingError(
      `https://api.github.com/repos/DataDog/rum-events-format/branches/${branchOrCommit}`,
      {
        headers: {
          ...(token ? { Authorization: `token ${token}` } : {}),
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
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

  return commitHash
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

async function update(commitHash: string) {
  printLog(`Copying rum-events-format schemas from ${commitHash}...`)
  const archiveDir = await downloadGitHubArchive('DataDog/rum-events-format', commitHash)
  fs.rmSync(RUM_EVENTS_FORMAT_SCHEMAS_DIR, { recursive: true, force: true })
  fs.cpSync(path.join(archiveDir, 'schemas'), RUM_EVENTS_FORMAT_SCHEMAS_DIR, { recursive: true })
  fs.rmSync(archiveDir, { recursive: true, force: true })
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
 * Download the archive of a GitHub repository at a given commit, extract it in a new temporary
 * directory created in `parentDir` and return the path of that directory.
 */
async function downloadGitHubArchive(repository: string, commitHash: string, parentDir = os.tmpdir()): Promise<string> {
  const response = await fetchHandlingError(`https://github.com/${repository}/archive/${commitHash}.tar.gz`)
  fs.mkdirSync(parentDir, { recursive: true })
  const archiveDir = fs.mkdtempSync(path.join(parentDir, 'github-archive-'))
  const archivePath = path.join(archiveDir, 'archive.tar.gz')
  fs.writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()))
  command`tar -xzf ${archivePath} -C ${archiveDir} --strip-components=1`.run()
  fs.rmSync(archivePath)
  return archiveDir
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

let jsonSchemaToTypescriptCache: Promise<typeof jsonSchemaToTypescriptModule> | undefined

function getJsonSchemaToTypescript() {
  if (!jsonSchemaToTypescriptCache) {
    jsonSchemaToTypescriptCache = (async () => {
      const entryPoint = path.join(JSON2TYPE_PATH, 'dist/src/index.js')
      if (!fs.existsSync(entryPoint)) {
        await buildJsonSchemaToTypescript()
      }
      return (await import(pathToFileURL(entryPoint).href)) as typeof jsonSchemaToTypescriptModule
    })()
  }
  return jsonSchemaToTypescriptCache
}

async function buildJsonSchemaToTypescript() {
  printLog('Building json-schema-to-typescript...')
  // Extract next to the final location, so it can be moved there atomically once built
  const archiveDir = await downloadGitHubArchive(JSON2TYPE_REPOSITORY, JSON2TYPE_COMMIT, path.dirname(JSON2TYPE_PATH))
  command`npm install --ignore-scripts --no-audit --no-fund`.withCurrentWorkingDirectory(archiveDir).run()
  command`npm run build:server`.withCurrentWorkingDirectory(archiveDir).run()
  fs.rmSync(JSON2TYPE_PATH, { recursive: true, force: true })
  fs.renameSync(archiveDir, JSON2TYPE_PATH)
}
