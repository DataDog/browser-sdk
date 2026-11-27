// Release job, run on every push to main: tag and draft-release a merged release pull request,
// then open or update the next one. Runs the release-please CLI with our custom release type.
//
// Local dry run: `node scripts/release/release-please.ts --dry-run --target-branch <branch>`
// (uses the `gh` token instead of dd-octo-sts).
//
// Not part of release-please's public API: the Node strategy is a deep import (no public way to
// extend a built-in release type). The package entry point must be loaded first (circular imports
// between strategies).
import { parseArgs } from 'node:util'
import { GitHub, Manifest, registerReleaseType } from 'release-please'
import type { ConventionalCommit } from 'release-please'
import { Node } from 'release-please/build/src/strategies/node.js'
import { command } from '../lib/command.ts'
import { runMain } from '../lib/executionUtils.ts'
import { getGithubReleasePleaseToken } from '../lib/secrets.ts'
import { checkReleaseNotes } from '../lib/checkReleaseNotes.ts'

export const BROWSER_SDK_RELEASE_TYPE = 'browser-sdk'
const JS_CORE_SCOPE = 'js-core'

/**
 * Release type of the Browser SDK (root component). The root receives every commit, including the
 * ones only changing @datadog/js-core. A breaking change in js-core alone (`feat(js-core)!: …`) must
 * only bump js-core (pre-1.0, so a minor): for the Browser SDK, it is a regular commit.
 */
export class BrowserSdkStrategy extends Node {
  async postProcessCommits(commits: ConventionalCommit[]): Promise<ConventionalCommit[]> {
    return (await super.postProcessCommits(commits)).map(ignoreJsCoreBreakingChange)
  }
}

export function ignoreJsCoreBreakingChange(commit: ConventionalCommit): ConventionalCommit {
  if (!commit.breaking || commit.scope?.trim() !== JS_CORE_SCOPE) {
    return commit
  }
  return {
    ...commit,
    breaking: false,
    notes: commit.notes.filter(({ title }) => title !== 'BREAKING CHANGE'),
    // The changelog writer also adds a breaking change note when the header has a `!`.
    message: commit.message.replace(/^([a-z]+\([^()]*\))!:/, '$1:'),
  }
}

export function registerBrowserSdkReleaseType() {
  registerReleaseType(BROWSER_SDK_RELEASE_TYPE, (options) => new BrowserSdkStrategy(options))
}

if (!process.env.NODE_TEST_CONTEXT) {
  runMain(async () => {
    const { values } = parseArgs({
      options: { 'dry-run': { type: 'boolean', default: false }, 'target-branch': { type: 'string', default: 'main' } },
    })
    await main({ dryRun: values['dry-run'], targetBranch: values['target-branch'] })
  })
}

async function main({ dryRun, targetBranch }: { dryRun: boolean; targetBranch: string }) {
  registerBrowserSdkReleaseType()

  if (dryRun) {
    const manifest = await loadManifest(command`gh auth token`.run().trim(), targetBranch)
    await manifest.buildReleases() // Runs the pending-release check.
    for (const pullRequest of await manifest.buildPullRequests()) {
      console.log(`Would open: ${pullRequest.title.toString()} (${pullRequest.headRefName})`)
      console.log(pullRequest.updates.map((update) => `  ${update.path}`).join('\n'))
      console.log(pullRequest.body.toString())
    }
    return
  }

  using token = getGithubReleasePleaseToken()
  const manifest = await loadManifest(token.value, targetBranch)

  // Same steps as `release-please github-release` then `release-please release-pr`. The manifest is
  // loaded again after tagging, so the next release pull request starts from the new release.
  const releases = await manifest.createReleases()
  console.log('Created releases:', releases)
  const pullRequests = await (await loadManifest(token.value, targetBranch)).createPullRequests()
  console.log('Updated release pull requests:', pullRequests)
}

async function loadManifest(token: string, targetBranch: string) {
  const github = await GitHub.create({ owner: 'DataDog', repo: 'browser-sdk', token })
  const manifest = await Manifest.fromManifest(
    github,
    targetBranch,
    'release-please-config.json',
    '.release-please-manifest.json'
  )
  // Fail before tagging if a pending release pull request was merged without listing every change.
  // `createReleases()` calls `buildReleases()` itself, so the check runs on the releases it tags.
  const buildReleases = manifest.buildReleases.bind(manifest)
  manifest.buildReleases = async () => {
    const releases = await buildReleases()
    checkReleaseNotes(releases)
    return releases
  }
  return manifest
}
