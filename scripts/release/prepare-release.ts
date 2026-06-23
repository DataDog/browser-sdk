import fs from 'node:fs'
import { parseArgs } from 'node:util'
import { runMain, printLog } from '../lib/executionUtils.ts'
import { findPackageJsonFiles, isIndependentlyVersionedPackage, isSemanticVersion } from '../lib/filesUtils.ts'
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

  // Independently-versioned packages (e.g. @openobserve/js-core) are not synced to the release version.
  // For now they get a simple patch bump on each release. Compute their new versions up front so we
  // can also update the packages that depend on them.
  const independentVersions = new Map<string, string>()
  for (const { content } of packageJsonFiles) {
    if (content.name && isIndependentlyVersionedPackage(content.name) && isSemanticVersion(content.version)) {
      independentVersions.set(content.name, incrementPatch(content.version!))
    }
  }

  for (const { path: absolutePath, content } of packageJsonFiles) {
    if (content.name && independentVersions.has(content.name)) {
      content.version = independentVersions.get(content.name)
    } else if (!isIndependentlyVersionedPackage(content.name) && isSemanticVersion(content.version)) {
      content.version = version
    }

    for (const depField of ['dependencies', 'peerDependencies', 'devDependencies'] as const) {
      if (!content[depField]) {
        continue
      }

      for (const [key, value] of Object.entries(content[depField])) {
        if (independentVersions.has(key) && isSemanticVersion(value)) {
          content[depField][key] = independentVersions.get(key)!
        } else if (key.startsWith('@openobserve/browser-') && isSemanticVersion(value)) {
          content[depField][key] = version
        }
      }
    }

    fs.writeFileSync(absolutePath, `${JSON.stringify(content, null, 2)}\n`)
  }
}

// Bumps the patch component (e.g. `0.0.1` -> `0.0.2`).
function incrementPatch(version: string): string {
  const [major, minor, patch] = version.split('.').map(Number)
  return `${major}.${minor}.${patch + 1}`
}
