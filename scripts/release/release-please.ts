// Release job, run on every push to main: tag and draft-release a merged release pull request,
// then open or update the next one. Runs the release-please CLI with our custom release type.
//
// Local dry run: `node scripts/release/release-please.ts --dry-run --target-branch <branch>`
// (uses the `gh` token instead of dd-octo-sts).
//
// Not part of release-please's public API: the Node strategy, the plugin base class and the
// changelog updater are deep imports (no public way to extend a built-in release type or to write a
// plugin). The package entry point must be loaded first (circular imports between strategies).
import { parseArgs } from 'node:util'
import { GitHub, Manifest, registerPlugin, registerReleaseType } from 'release-please'
import type { ConventionalCommit } from 'release-please'
import type { CandidateReleasePullRequest } from 'release-please/build/src/manifest.js'
import { Node } from 'release-please/build/src/strategies/node.js'
import { ManifestPlugin } from 'release-please/build/src/plugin.js'
import { Changelog } from 'release-please/build/src/updaters/changelog.js'
import { command } from '../lib/command.ts'
import { runMain } from '../lib/executionUtils.ts'
import { getGithubReleasePleaseToken } from '../lib/secrets.ts'
import { checkReleaseNotes } from '../lib/checkReleaseNotes.ts'

export const BROWSER_SDK_RELEASE_TYPE = 'browser-sdk'
export const JS_CORE_DEPENDENCY_NOTES_PLUGIN = 'browser-sdk-js-core-dependency-notes'
const JS_CORE_SCOPE = 'js-core'
const JS_CORE_PATH = 'packages/js-core'

/**
 * Release type of the Browser SDK (root component). The root receives every commit, including the
 * ones only changing @datadog/js-core: the SDK packages depend on js-core, and only the SDK release
 * pipeline publishes js-core.
 *
 * A breaking change in js-core alone (`feat(js-core)!: …`) must only bump js-core (pre-1.0, so a
 * minor): for the Browser SDK, it is a regular commit.
 *
 * The js-core changelog lists the commits that only change js-core. The Browser SDK changelog does
 * not repeat them: {@link JsCoreDependencyNotes} adds one "Update @datadog/js-core" entry instead.
 */
export class BrowserSdkStrategy extends Node {
  private hasJsCoreOnlyNotes = false

  async postProcessCommits(commits: ConventionalCommit[]): Promise<ConventionalCommit[]> {
    return (await super.postProcessCommits(commits)).map(ignoreJsCoreBreakingChange)
  }

  protected async buildReleaseNotes(
    ...[conventionalCommits, ...options]: Parameters<Node['buildReleaseNotes']>
  ): Promise<string> {
    const jsCoreOnlyCommits = conventionalCommits.filter(isJsCoreOnlyCommit)
    this.hasJsCoreOnlyNotes =
      jsCoreOnlyCommits.length > 0 &&
      !super.changelogEmpty(await super.buildReleaseNotes(jsCoreOnlyCommits, ...options))
    return super.buildReleaseNotes(
      conventionalCommits.filter((commit) => !isJsCoreOnlyCommit(commit)),
      ...options
    )
  }

  // A release with only js-core changes still releases the Browser SDK.
  protected changelogEmpty(changelogEntry: string): boolean {
    return super.changelogEmpty(changelogEntry) && !this.hasJsCoreOnlyNotes
  }
}

export function isJsCoreOnlyCommit({ files }: ConventionalCommit): boolean {
  return files !== undefined && files.length > 0 && files.every((file) => file.startsWith(`${JS_CORE_PATH}/`))
}

/**
 * Adds "Update @datadog/js-core to x.y.z" to the Browser SDK release notes and changelog when the
 * release pull request also releases js-core. Runs before release-please merges the components in
 * one release pull request.
 */
export class JsCoreDependencyNotes extends ManifestPlugin {
  run(candidates: CandidateReleasePullRequest[]): Promise<CandidateReleasePullRequest[]> {
    const jsCoreVersion = candidates.find(({ path }) => path === JS_CORE_PATH)?.pullRequest.version
    const root = candidates.find(({ path }) => path === '.')
    if (jsCoreVersion && root) {
      const addEntry = (notes: string) =>
        `${notes.trimEnd()}\n\n\n### Dependencies\n\n* Update @datadog/js-core to ${jsCoreVersion.toString()}\n`
      for (const update of root.pullRequest.updates) {
        if (update.updater instanceof Changelog) {
          update.updater.changelogEntry = addEntry(update.updater.changelogEntry)
        }
      }
      for (const releaseData of root.pullRequest.body.releaseData) {
        releaseData.notes = addEntry(releaseData.notes)
      }
    }
    return Promise.resolve(candidates)
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
  registerPlugin(
    JS_CORE_DEPENDENCY_NOTES_PLUGIN,
    ({ github, targetBranch, repositoryConfig, logger }) =>
      new JsCoreDependencyNotes(github, targetBranch, repositoryConfig, logger)
  )
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
