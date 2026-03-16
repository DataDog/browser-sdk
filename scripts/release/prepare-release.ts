import fs from 'node:fs'
import { parseArgs } from 'node:util'
import { runMain, printLog } from '../lib/executionUtils.ts'
import { findPackageJsonFiles } from '../lib/filesUtils.ts'
import { command } from '../lib/command.ts'

runMain(() => {
  const {
    positionals: [version],
    values: { push },
  } = parseArgs({
    allowPositionals: true,
    options: {
      push: { type: 'boolean', default: false },
    },
  })

  if (!isSemanticVersion(version)) {
    throw new Error('Missing or invalid version argument. Usage: node scripts/release/prepare-release.ts <version>')
  }

  if (command`git status --porcelain`.run().trim()) {
    throw new Error('Git working tree is not clean')
  }

  const releaseBranch = `release/v${version}`
  const currentBranch = command`git branch --show-current`.run().trim()
  if (currentBranch !== releaseBranch) {
    printLog(`Checking out ${releaseBranch} branch...`)
    command`git fetch origin`.run()
    command`git checkout -b ${releaseBranch} origin/main`.run()
  }

  printLog(`Preparing release v${version}...`)

  command`yarn`.withLogs().run() // Just in case

  setVersionInPackageJsonFiles(version)
  updateLernaJson(version)
  command`node ./scripts/release/generate-changelog/index.ts`.withLogs().run()
  command`yarn`.run() // Update lockfile
  command`git add -u`.run()
  command`git commit -m v${version}`.run()
  command`git tag -a v${version} -m v${version}`.run()

  if (push) {
    command`git push origin ${releaseBranch} v${version}`.withLogs().run()
  }

  printLog(`Release v${version} prepared successfully!`)
  printLog('Next steps:')
  if (!push) {
    printLog(`  * git push origin ${releaseBranch} v${version}`)
  }
  printLog(`  * Open a PR from ${releaseBranch} to main`)
  printLog('  * Ask for a review and merge the PR')
  printLog('  * Go to the CI and trigger the deployment pipeline')
})

function setVersionInPackageJsonFiles(version: string) {
  const packageJsonFiles = findPackageJsonFiles()

  for (const { path: absolutePath, content } of packageJsonFiles) {
    if (isSemanticVersion(content.version)) {
      content.version = version
    }
    for (const depField of ['dependencies', 'peerDependencies', 'devDependencies'] as const) {
      if (!content[depField]) {
        continue
      }

      for (const [key, value] of Object.entries(content[depField])) {
        if (key.startsWith('@datadog/') && isSemanticVersion(value)) {
          content[depField][key] = version
        }
      }
    }

    fs.writeFileSync(absolutePath, `${JSON.stringify(content, null, 2)}\n`)
  }
}

function updateLernaJson(version: string) {
  const lernaJsonPath = `${import.meta.dirname}/../../lerna.json`
  const content = JSON.parse(fs.readFileSync(lernaJsonPath, 'utf8'))
  content.version = version
  fs.writeFileSync(lernaJsonPath, `${JSON.stringify(content, null, 2)}\n`)
}

function isSemanticVersion(input: string | undefined): boolean {
  return input !== undefined && /^\d+\.\d+\.\d+$/.test(input)
}
